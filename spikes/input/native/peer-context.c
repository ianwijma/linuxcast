/* Included only by context.c. No arbitrary PID, library path, user-selected bus,
   input device, control messages or client-supplied descriptor is accepted. */
#ifndef SO_PEERPIDFD
#error Debian target headers must define SO_PEERPIDFD
#endif
extern char **environ;
static int peer_environment_empty(void) { return !environ || !environ[0]; }
static uint32_t peer_lifetime(struct lc_context *c) {
    struct pollfd process = { .fd = c->peer_pidfd, .events = POLLIN };
    int r = poll(&process, 1, 0);
    if (r < 0 || process.revents) return LC_CONTEXT_PEER_DEAD;
    struct pollfd transport = { .fd = c->peer_socket, .events = POLLRDHUP };
    r = poll(&transport, 1, 0);
    if (r < 0 || (transport.revents & (POLLRDHUP | POLLHUP | POLLERR | POLLNVAL)))
        return LC_CONTEXT_PEER_DISCONNECTED;
    return LC_CONTEXT_OK;
}
static void peer_terminal(struct lc_context *c, uint32_t status) {
    if (!c->peer_terminal) {
        invalidate(c);
        c->peer_terminal = status;
    }
}
/* The option parameter is internal solely so the separate fixture can exercise
   an unsupported kernel-option error. Production always uses SO_PEERPIDFD. */
static uint32_t peer_capture(struct lc_context *c, int connected_socket,
                             uint32_t expected_uid, int option) {
    struct ucred credentials;
    socklen_t size = sizeof(credentials);
    int domain = 0, type = 0, listening = 1;
    socklen_t integer_size = sizeof(int);
    if (getsockopt(connected_socket, SOL_SOCKET, SO_DOMAIN, &domain, &integer_size) < 0 ||
        integer_size != sizeof(int) || domain != AF_UNIX) return LC_CONTEXT_PEER_BINDING_INVALID;
    integer_size = sizeof(int);
    if (getsockopt(connected_socket, SOL_SOCKET, SO_TYPE, &type, &integer_size) < 0 ||
        integer_size != sizeof(int) || type != SOCK_STREAM) return LC_CONTEXT_PEER_BINDING_INVALID;
    integer_size = sizeof(int);
    if (getsockopt(connected_socket, SOL_SOCKET, SO_ACCEPTCONN, &listening, &integer_size) < 0 ||
        integer_size != sizeof(int) || listening) return LC_CONTEXT_PEER_BINDING_INVALID;
    if (getsockopt(connected_socket, SOL_SOCKET, SO_PEERCRED, &credentials, &size) < 0 ||
        size != sizeof(credentials) || credentials.pid <= 0) return LC_CONTEXT_PEER_BINDING_INVALID;
    if (credentials.uid != expected_uid) return LC_CONTEXT_UID_MISMATCH;
    c->peer_socket = fcntl(connected_socket, F_DUPFD_CLOEXEC, 3);
    if (c->peer_socket < 0) return LC_CONTEXT_PEER_BINDING_INVALID;
    size = sizeof(c->peer_pidfd);
    if (getsockopt(c->peer_socket, SOL_SOCKET, option, &c->peer_pidfd, &size) < 0)
        return LC_CONTEXT_PEER_PIDFD_UNAVAILABLE;
    if (size != sizeof(c->peer_pidfd) || c->peer_pidfd < 0)
        return LC_CONTEXT_PEER_PIDFD_UNAVAILABLE;
    int flags = fcntl(c->peer_pidfd, F_GETFD);
    if (flags < 0 || fcntl(c->peer_pidfd, F_SETFD, flags | FD_CLOEXEC) < 0)
        return LC_CONTEXT_PEER_PIDFD_UNAVAILABLE;
    c->uid = credentials.uid;
    c->peer_pid = credentials.pid;
    return peer_lifetime(c);
}
struct lc_context *lc_context_open_peer(int connected_socket, uint32_t expected_uid,
                                      struct lc_context_observation *out) {
    memset(out, 0, sizeof(*out));
    out->status = LC_CONTEXT_PEER_BINDING_INVALID;
    if (!peer_environment_empty()) { out->status = LC_CONTEXT_ENVIRONMENT_UNTRUSTED; return NULL; }
    struct lc_context *c = calloc(1, sizeof(*c));
    if (!c) return NULL;
    c->epoch = 1; c->peer_mode = 1; c->peer_socket = -1; c->peer_pidfd = -1;
    /* Fixed public symbol from the already-linked system library. No dlopen,
       loader search, environment-derived library or unsafe numeric-PID fallback.
       Keeping this optional preserves the own-probe's libsystemd249 ABI. */
    c->peer_session_fn = (int (*)(int, char **))dlsym(RTLD_DEFAULT, "sd_pidfd_get_session");
    c->peer_uid_fn = sd_session_get_uid;
    if (!c->peer_session_fn) out->status = LC_CONTEXT_PEER_SESSION_UNSUPPORTED;
    else out->status = peer_capture(c, connected_socket, expected_uid, SO_PEERPIDFD);
    if (out->status == LC_CONTEXT_OK) return c;
    lc_context_close(c);
    return NULL;
}
static uint32_t peer_binding(struct lc_context *c) {
    if (!peer_environment_empty()) return LC_CONTEXT_ENVIRONMENT_UNTRUSTED;
    uint32_t status = peer_lifetime(c);
    if (status != LC_CONTEXT_OK) return status;
    if (!c->peer_session_fn) return LC_CONTEXT_PEER_SESSION_UNSUPPORTED;
    char *id = NULL;
    uid_t uid = (uid_t)-1;
    int r = c->peer_session_fn(c->peer_pidfd, &id);
    if (r < 0 || !id || strnlen(id, sizeof(c->session)) >= sizeof(c->session)) {
        free(id);
        return LC_CONTEXT_NO_SESSION;
    }
    if (c->peer_uid_fn(id, &uid) < 0 || uid != c->uid) status = LC_CONTEXT_UID_MISMATCH;
    else if (c->session[0] && strcmp(id, c->session) != 0) status = LC_CONTEXT_PEER_SESSION_CHANGED;
    else if (!c->session[0]) memcpy(c->session, id, strlen(id) + 1);
    free(id);
    uint32_t after = peer_lifetime(c);
    return after == LC_CONTEXT_OK ? status : after;
}
static uint32_t peer_system_bus(struct lc_context *c) {
    struct stat metadata;
    const char *parents[] = { "/run", "/run/dbus" };
    for (unsigned i = 0; i < 2; ++i)
        if (lstat(parents[i], &metadata) < 0 || !S_ISDIR(metadata.st_mode) ||
            metadata.st_uid != 0 || (metadata.st_mode & 0022)) return LC_CONTEXT_BUS_UNAVAILABLE;
    if (lstat("/run/dbus/system_bus_socket", &metadata) < 0 ||
        !S_ISSOCK(metadata.st_mode) || metadata.st_uid != 0) return LC_CONTEXT_BUS_UNAVAILABLE;
    if (sd_bus_new(&c->bus) < 0 ||
        sd_bus_set_address(c->bus, "unix:path=/run/dbus/system_bus_socket") < 0 ||
        sd_bus_set_bus_client(c->bus, 1) < 0 || sd_bus_start(c->bus) < 0)
        return LC_CONTEXT_BUS_UNAVAILABLE;
    int r = subscribe(c);
    return r < 0 ? failure(r) : LC_CONTEXT_OK;
}
void lc_context_sample_peer(struct lc_context *c, struct lc_context_observation *out) {
    uint64_t start_us = now_us();
    uint64_t started = start_us / 1000;
    c->deadline_us = start_us + QUERY_BUDGET_US;
    memset(out, 0, sizeof(*out));
    if (!c->peer_mode) { out->status = LC_CONTEXT_PEER_BINDING_INVALID; return; }
    uint32_t status = c->peer_terminal ? c->peer_terminal : peer_binding(c);
    if (status == LC_CONTEXT_OK && !c->bus) {
        status = remaining(c) ? peer_system_bus(c) : LC_CONTEXT_QUERY_DEADLINE;
    }
    if (status == LC_CONTEXT_OK) {
        /* Session + stable process/transport checks bracket the whole bus read.
           sd_pidfd_get_session also verifies PID identity around its own read. */
        status = peer_binding(c);
        if (status == LC_CONTEXT_OK) {
            sample_bound(c, out);
            status = out->status;
            uint32_t after = peer_binding(c);
            if (after != LC_CONTEXT_OK) status = after;
        }
    }
    out->started_ms = started;
    out->observed_ms = now_us() / 1000;
    if (out->observed_ms < started || out->observed_ms - started > 250)
        status = LC_CONTEXT_QUERY_DEADLINE;
    if (status != LC_CONTEXT_OK) {
        peer_terminal(c, status);
        out->flags = 0;
    }
    out->status = c->peer_terminal ? c->peer_terminal : status;
    out->epoch = c->epoch;
}
