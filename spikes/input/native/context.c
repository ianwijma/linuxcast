#include "context.h"
#include <systemd/sd-bus.h>
#include <systemd/sd-login.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/stat.h>

#define LOGIN "org.freedesktop.login1"
#define MANAGER "/org/freedesktop/login1"
#define SESSION "org.freedesktop.login1.Session"
#define DBUS "org.freedesktop.DBus"
#define DBUS_PATH "/org/freedesktop/DBus"
#define QUERY_BUDGET_US 250000
#define CALL_BUDGET_US 50000
#define MAX_DISPATCH 32
struct lc_context {
    sd_bus *bus;
    uid_t uid;
    char session[256];
    char path[256];
    char owner[64];
    uint64_t epoch;
    uint64_t deadline_us;
    int invalidated;
    unsigned event_count;
    int flood;
};
static uint64_t now_us(void) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t) < 0) return UINT64_MAX;
    return (uint64_t)t.tv_sec * 1000000 + (uint64_t)t.tv_nsec / 1000;
}
static uint64_t remaining(struct lc_context *c) {
    uint64_t now = now_us();
    if (now >= c->deadline_us) return 0;
    uint64_t left = c->deadline_us - now;
    return left < CALL_BUDGET_US ? left : CALL_BUDGET_US;
}
static void invalidate(struct lc_context *c) {
    if (c->epoch < UINT64_MAX) ++c->epoch;
    c->invalidated = 1;
}
static void event(struct lc_context *c) {
    if (c->event_count < MAX_DISPATCH + 1) ++c->event_count;
    if (c->event_count > MAX_DISPATCH) c->flood = 1;
    invalidate(c);
}
static int owner_change(sd_bus_message *m, void *userdata, sd_bus_error *error) {
    (void)error;
    struct lc_context *c = userdata;
    const char *name, *old, *next;
    if (sd_bus_message_read(m, "sss", &name, &old, &next) <= 0 || strcmp(name, LOGIN) == 0)
        event(c);
    return c->flood ? -EOVERFLOW : 0;
}
static int property_change(sd_bus_message *m, void *userdata, sd_bus_error *error) {
    (void)error;
    struct lc_context *c = userdata;
    const char *sender = sd_bus_message_get_sender(m);
    const char *path = sd_bus_message_get_path(m);
    /* Ignore unrelated services; every property mutation/invalidation of the
       selected session invalidates the entire snapshot, including unknown keys. */
    if (sender && path && strcmp(sender, c->owner) == 0 && strcmp(path, c->path) == 0)
        event(c);
    return c->flood ? -EOVERFLOW : 0;
}
static int session_removed(sd_bus_message *m, void *userdata, sd_bus_error *error) {
    (void)error;
    struct lc_context *c = userdata;
    const char *id, *path;
    if (sd_bus_message_read(m, "so", &id, &path) <= 0 || strcmp(id, c->session) == 0)
        event(c);
    return c->flood ? -EOVERFLOW : 0;
}
static int disconnected(sd_bus_message *m, void *userdata, sd_bus_error *error) {
    (void)m; (void)error;
    invalidate(userdata);
    return 0;
}
static int pump(struct lc_context *c) {
    for (unsigned i = 0; i < MAX_DISPATCH; ++i) {
        if (!remaining(c)) return -ETIMEDOUT;
        int r = sd_bus_process(c->bus, NULL);
        if (r <= 0) return r;
    }
    invalidate(c);
    return -EOVERFLOW;
}
/* Every application method is a fixed read. Auto-activation is disabled;
   no caller-supplied destination, member, path, PID or session is accepted. */
static int call(struct lc_context *c, const char *destination, const char *path,
                const char *interface, const char *member, const char *argument,
                const char *property, sd_bus_message **reply) {
    sd_bus_message *request = NULL;
    uint64_t left = remaining(c);
    if (!left) return -ETIMEDOUT;
    int r = sd_bus_message_new_method_call(c->bus, &request, destination, path, interface, member);
    if (r >= 0) r = sd_bus_message_set_auto_start(request, 0);
    if (r >= 0 && argument) r = sd_bus_message_append(request, "s", argument);
    if (r >= 0 && property) r = sd_bus_message_append(request, "s", property);
    if (r >= 0) r = sd_bus_call(c->bus, request, left, NULL, reply);
    sd_bus_message_unref(request);
    return r;
}
static int property(struct lc_context *c, const char *name, const char *signature,
                    sd_bus_message **reply) {
    int r = call(c, c->owner, c->path, "org.freedesktop.DBus.Properties", "Get", SESSION, name, reply);
    if (r >= 0 && !sd_bus_message_has_signature(*reply, "v")) r = -EBADMSG;
    if (r >= 0) r = sd_bus_message_enter_container(*reply, 'v', signature);
    return r;
}
static int boolean(struct lc_context *c, const char *name, uint32_t flag, uint32_t *flags) {
    sd_bus_message *reply = NULL;
    int value = 0;
    int r = property(c, name, "b", &reply);
    if (r > 0) r = sd_bus_message_read(reply, "b", &value);
    if (r > 0 && value) *flags |= flag;
    sd_bus_message_unref(reply);
    return r > 0 ? 0 : r < 0 ? r : -EBADMSG;
}
static int string_flag(struct lc_context *c, const char *name, const char *first,
                       const char *second, uint32_t flag, uint32_t *flags) {
    sd_bus_message *reply = NULL;
    const char *value = NULL;
    int r = property(c, name, "s", &reply);
    if (r > 0) r = sd_bus_message_read(reply, "s", &value);
    if (r > 0 && (strcmp(value, first) == 0 || (second && strcmp(value, second) == 0)))
        *flags |= flag;
    sd_bus_message_unref(reply);
    return r > 0 ? 0 : r < 0 ? r : -EBADMSG;
}
static uint32_t failure(int r) {
    if (r == -ETIMEDOUT) return LC_CONTEXT_QUERY_DEADLINE;
    if (r == -EOVERFLOW) return LC_CONTEXT_FLOOD;
    if (r == -EBADMSG || r == -ENXIO || r == -EINVAL) return LC_CONTEXT_MALFORMED;
    return LC_CONTEXT_QUERY_UNAVAILABLE;
}
static int read_snapshot(struct lc_context *c, uint32_t *flags) {
    sd_bus_message *reply = NULL;
    const char *value = NULL;
    uint32_t uid = UINT32_MAX;
    int r = call(c, DBUS, DBUS_PATH, DBUS, "GetNameOwner", LOGIN, NULL, &reply);
    if (r >= 0 && !sd_bus_message_has_signature(reply, "s")) r = -EBADMSG;
    if (r >= 0) r = sd_bus_message_read(reply, "s", &value);
    if (r <= 0 || !value || value[0] != ':' || strnlen(value, sizeof(c->owner)) >= sizeof(c->owner)) {
        sd_bus_message_unref(reply);
        return r < 0 ? r : -EBADMSG;
    }
    if (c->owner[0] && strcmp(value, c->owner) != 0) invalidate(c);
    memcpy(c->owner, value, strlen(value) + 1);
    reply = sd_bus_message_unref(reply);
    r = call(c, DBUS, DBUS_PATH, DBUS, "GetConnectionUnixUser", c->owner, NULL, &reply);
    if (r >= 0 && !sd_bus_message_has_signature(reply, "u")) r = -EBADMSG;
    if (r >= 0) r = sd_bus_message_read(reply, "u", &uid);
    reply = sd_bus_message_unref(reply);
    if (r <= 0) return r < 0 ? r : -EBADMSG;
    if (uid != 0) return -EACCES;
    *flags |= LC_OWNER_ROOT;
    r = call(c, c->owner, MANAGER, LOGIN ".Manager", "GetSession", c->session, NULL, &reply);
    if (r >= 0 && !sd_bus_message_has_signature(reply, "o")) r = -EBADMSG;
    if (r >= 0) r = sd_bus_message_read(reply, "o", &value);
    if (r <= 0 || !value || strncmp(value, MANAGER "/session/", strlen(MANAGER "/session/")) != 0 ||
        strnlen(value, sizeof(c->path)) >= sizeof(c->path)) {
        sd_bus_message_unref(reply);
        return r < 0 ? r : -EBADMSG;
    }
    if (c->path[0] && strcmp(value, c->path) != 0) invalidate(c);
    memcpy(c->path, value, strlen(value) + 1);
    reply = sd_bus_message_unref(reply);
    r = property(c, "User", "(uo)", &reply);
    if (r > 0) r = sd_bus_message_read(reply, "(uo)", &uid, &value);
    reply = sd_bus_message_unref(reply);
    if (r <= 0) return r < 0 ? r : -EBADMSG;
    if (uid != c->uid) return -EPERM;
    *flags |= LC_UID_MATCHED;
    int remote = 1;
    r = property(c, "Remote", "b", &reply);
    if (r > 0) r = sd_bus_message_read(reply, "b", &remote);
    reply = sd_bus_message_unref(reply);
    if (r <= 0) return r < 0 ? r : -EBADMSG;
    if (!remote) *flags |= LC_LOCAL;
    if ((r = boolean(c, "Active", LC_ACTIVE, flags)) < 0 ||
        (r = string_flag(c, "Type", "wayland", "x11", LC_GRAPHICAL, flags)) < 0 ||
        (r = string_flag(c, "Class", "user", NULL, LC_USER_CLASS, flags)) < 0) return r;
    r = property(c, "Seat", "(so)", &reply);
    if (r > 0) r = sd_bus_message_read(reply, "(so)", &value, NULL);
    if (r > 0 && strcmp(value, "seat0") == 0) *flags |= LC_SEAT0;
    reply = sd_bus_message_unref(reply);
    if (r <= 0) return r < 0 ? r : -EBADMSG;
    r = boolean(c, "LockedHint", LC_HINT_LOCKED, flags);
    if (r < 0) return r;
    *flags |= LC_HINT_KNOWN;
    return 0;
}
static int subscribe(struct lc_context *c) {
    int r;
    const char *matches[] = {
        "type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.freedesktop.login1'",
        "type='signal',sender='org.freedesktop.login1',path_namespace='/org/freedesktop/login1/session',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'",
        "type='signal',sender='org.freedesktop.login1',interface='org.freedesktop.login1.Manager',member='SessionRemoved'",
        "type='signal',interface='org.freedesktop.DBus.Local',member='Disconnected'"
    };
    sd_bus_message_handler_t callbacks[] = { owner_change, property_change, session_removed, disconnected };
    for (unsigned i = 0; i < 4; ++i) {
        uint64_t left = remaining(c);
        if (!left) return -ETIMEDOUT;
        if ((r = sd_bus_set_method_call_timeout(c->bus, left)) < 0 ||
            (r = sd_bus_add_match(c->bus, NULL, matches[i], callbacks[i], c)) < 0) return r;
    }
    return 0;
}
struct lc_context *lc_context_open(struct lc_context_observation *out) {
    memset(out, 0, sizeof(*out));
    out->status = LC_CONTEXT_NO_SESSION;
    struct lc_context *c = calloc(1, sizeof(*c));
    char *id = NULL;
    if (!c) { out->status = LC_CONTEXT_QUERY_UNAVAILABLE; return NULL; }
    c->uid = getuid();
    c->epoch = 1;
    uid_t session_uid = (uid_t)-1;
    /* This process only. User-manager processes without a definite PID session
       are denied, not rebound to a same-UID active graphical session. */
    if (sd_pid_get_session(getpid(), &id) < 0 || !id || strnlen(id, sizeof(c->session)) >= sizeof(c->session))
        goto fail;
    memcpy(c->session, id, strlen(id) + 1);
    free(id); id = NULL;
    if (sd_session_get_uid(c->session, &session_uid) < 0 || session_uid != c->uid) {
        out->status = LC_CONTEXT_UID_MISMATCH;
        goto fail;
    }
    out->flags = LC_PID_BOUND;
    c->deadline_us = now_us() + QUERY_BUDGET_US;
    out->status = LC_CONTEXT_BUS_UNAVAILABLE;
    /* No unprivileged process may replace the fixed system-bus endpoint.
       Socket mode itself can be0777; its root-owned parents prevent replacement. */
    struct stat metadata;
    const char *parents[] = { "/run", "/run/dbus" };
    for (unsigned i = 0; i < 2; ++i) {
        if (lstat(parents[i], &metadata) < 0 || !S_ISDIR(metadata.st_mode) ||
            metadata.st_uid != 0 || (metadata.st_mode & 0022)) goto fail;
    }
    if (lstat("/run/dbus/system_bus_socket", &metadata) < 0 ||
        !S_ISSOCK(metadata.st_mode) || metadata.st_uid != 0) goto fail;
    /* An explicit fixed system address ignores DBUS_* environment overrides. */
    out->status = LC_CONTEXT_BUS_UNAVAILABLE;
    if (sd_bus_new(&c->bus) < 0 ||
        sd_bus_set_address(c->bus, "unix:path=/run/dbus/system_bus_socket") < 0 ||
        sd_bus_set_bus_client(c->bus, 1) < 0 || sd_bus_start(c->bus) < 0) goto fail;
    int r = subscribe(c);
    if (r < 0) { out->status = failure(r); goto fail; }
    return c;
fail:
    free(id);
    lc_context_close(c);
    return NULL;
}
static void sample_bound(struct lc_context *c, struct lc_context_observation *out) {
    memset(out, 0, sizeof(*out));
    c->deadline_us = now_us() + QUERY_BUDGET_US;
    out->started_ms = now_us() / 1000;
    c->invalidated = 0;
    c->event_count = 0;
    c->flood = 0;
    int r = pump(c);
    if (r >= 0 && !c->invalidated) {
        out->flags = LC_PID_BOUND;
        r = read_snapshot(c, &out->flags);
    }
    if (r >= 0) r = pump(c);
    out->observed_ms = now_us() / 1000;
    if (r < 0) {
        out->status = r == -EACCES ? LC_CONTEXT_OWNER_UNTRUSTED :
                      r == -EPERM ? LC_CONTEXT_UID_MISMATCH : failure(r);
    } else out->status = c->invalidated ? LC_CONTEXT_INVALIDATED : LC_CONTEXT_OK;
    if (c->flood) out->status = LC_CONTEXT_FLOOD;
    if (out->observed_ms < out->started_ms || out->observed_ms - out->started_ms > 250)
        out->status = LC_CONTEXT_QUERY_DEADLINE;
    if (out->status != LC_CONTEXT_OK) {
        if (!c->invalidated) invalidate(c);
        out->flags = 0;
    }
    out->epoch = c->epoch;
}
static int binding_valid(struct lc_context *c) {
    char *id = NULL;
    uid_t uid = (uid_t)-1;
    int r = sd_pid_get_session(getpid(), &id);
    int matches = r >= 0 && id && strnlen(id, sizeof(c->session)) < sizeof(c->session) &&
        strcmp(id, c->session) == 0 && getuid() == c->uid &&
        sd_session_get_uid(id, &uid) >= 0 && uid == c->uid;
    free(id);
    return matches;
}
void lc_context_sample(struct lc_context *c, struct lc_context_observation *out) {
    uint64_t started_ms = now_us() / 1000;
    memset(out, 0, sizeof(*out));
    if (!binding_valid(c)) {
        invalidate(c);
        out->status = LC_CONTEXT_NO_SESSION;
    } else {
        sample_bound(c, out);
        if (!binding_valid(c)) {
            invalidate(c);
            out->status = LC_CONTEXT_INVALIDATED;
            out->flags = 0;
        }
    }
    out->started_ms = started_ms;
    out->observed_ms = now_us() / 1000;
    if (out->observed_ms < started_ms || out->observed_ms - started_ms > 250) {
        out->status = LC_CONTEXT_QUERY_DEADLINE;
        if (!c->invalidated) invalidate(c);
        out->flags = 0;
    }
    out->epoch = c->epoch;
}
void lc_context_close(struct lc_context *c) {
    if (!c) return;
    sd_bus_close(c->bus);
    sd_bus_unref(c->bus);
    free(c);
}
