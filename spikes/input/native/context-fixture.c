/* Private peer fixture only, separately built executable. Never linked into the
   production probe; no addresses/identity injection entry exists there. */
#include "context.c"
#include <sys/socket.h>
#include <sys/wait.h>
#include <stdio.h>
struct fixture { int mode; unsigned calls; int bad; int signaled; };
static int answer(sd_bus_message *request, struct fixture *f, const char *type,
                  const char *text, uint32_t number) {
    sd_bus_message *reply = NULL;
    int r = sd_bus_message_new_method_return(request, &reply);
    if (r >= 0) r = sd_bus_message_set_sender(reply, ":1.42");
    if (r >= 0 && type[0] == 'v') r = sd_bus_message_open_container(reply, 'v', type + 1);
    const char *payload = type[0] == 'v' ? type + 1 : type;
    if (r >= 0) {
        if (strcmp(payload, "(uo)") == 0) r = sd_bus_message_append(reply, payload, number, "/fixture/user");
        else if (strcmp(payload, "(so)") == 0) r = sd_bus_message_append(reply, payload, text, "/fixture/seat");
        else if (strcmp(payload, "b") == 0 || strcmp(payload, "u") == 0) r = sd_bus_message_append(reply, payload, number);
        else r = sd_bus_message_append(reply, payload, text);
    }
    if (r >= 0 && type[0] == 'v') r = sd_bus_message_close_container(reply);
    if (r >= 0 && ((f->mode == 11 && strcmp(type, "s") == 0) ||
        (f->mode == 12 && type[0] == 'v')))
        r = sd_bus_message_append(reply, "s", "PrivateTrailingCanary");
    if (r >= 0) r = sd_bus_send(NULL, reply, NULL);
    sd_bus_message_unref(reply);
    if (r < 0) f->bad = 1;
    return 1;
}
static int handler(sd_bus_message *m, void *userdata, sd_bus_error *error) {
    (void)error;
    struct fixture *f = userdata;
    if (sd_bus_message_is_method_call(m, DBUS, "GetNameOwner")) {
        ++f->calls;
        return answer(m, f, "s", ":1.42", 0);
    }
    if (sd_bus_message_is_method_call(m, DBUS, "GetConnectionUnixUser")) {
        ++f->calls;
        return answer(m, f, "u", NULL, f->mode == 2 ? 1001 : 0);
    }
    if (sd_bus_message_is_method_call(m, LOGIN ".Manager", "GetSession")) {
        ++f->calls;
        return answer(m, f, "o", MANAGER "/session/fixture", 0);
    }
    if (sd_bus_message_is_method_call(m, "org.freedesktop.DBus.Properties", "Get")) {
        const char *interface, *name;
        if (sd_bus_message_read(m, "ss", &interface, &name) <= 0 || strcmp(interface, SESSION)) { f->bad = 1; return 1; }
        ++f->calls;
        if (f->mode == 4) return 1; /* Real bounded unanswered method call. */
        if ((f->mode == 5 || f->mode == 10 || f->mode == 13) && !f->signaled) {
            sd_bus_message *signal = NULL;
            int r;
            if (f->mode == 10) {
                r = sd_bus_message_new_signal(sd_bus_message_get_bus(m), &signal, DBUS_PATH, DBUS, "NameOwnerChanged");
                if (r >= 0) r = sd_bus_message_set_sender(signal, DBUS);
                if (r >= 0) r = sd_bus_message_append(signal, "sss", LOGIN, ":1.42", ":1.43");
            } else {
                r = sd_bus_message_new_signal(sd_bus_message_get_bus(m), &signal, MANAGER "/session/fixture", "org.freedesktop.DBus.Properties", "PropertiesChanged");
                if (r >= 0) r = sd_bus_message_set_sender(signal, ":1.42");
                if (r >= 0) r = sd_bus_message_append(signal, "s", SESSION);
                if (r >= 0) r = sd_bus_message_open_container(signal, 'a', "{sv}");
                if (r >= 0) r = sd_bus_message_close_container(signal);
                if (r >= 0) r = sd_bus_message_open_container(signal, 'a', "s");
                if (r >= 0) r = sd_bus_message_append(signal, "s", "PrivateFixtureCanary");
                if (r >= 0) r = sd_bus_message_close_container(signal);
            }
            if (r >= 0) r = sd_bus_send(NULL, signal, NULL);
            sd_bus_message_unref(signal);
            if (f->mode == 13) {
                /* A real burst while the client awaits a method reply also
                   exercises callback dispatch inside sd_bus_call itself. */
                for (unsigned i = 0; i < 40; ++i) {
                    signal = NULL;
                    if (sd_bus_message_new_signal(sd_bus_message_get_bus(m), &signal, DBUS_PATH, DBUS, "NameOwnerChanged") < 0 ||
                        sd_bus_message_set_sender(signal, DBUS) < 0 ||
                        sd_bus_message_append(signal, "sss", LOGIN, ":1.42", ":1.43") < 0 ||
                        sd_bus_send(NULL, signal, NULL) < 0) f->bad = 1;
                    sd_bus_message_unref(signal);
                }
            }
            if (r < 0) f->bad = 1;
            f->signaled = 1;
        }
        if (strcmp(name, "User") == 0) return answer(m, f, "v(uo)", NULL, f->mode == 1 ? 1001 : 1000);
        if (strcmp(name, "Remote") == 0) return answer(m, f, "vb", NULL, f->mode == 7);
        if (strcmp(name, "Active") == 0) return answer(m, f, f->mode == 3 ? "vs" : "vb", "PrivateFixtureCanary", f->mode != 9);
        if (strcmp(name, "Type") == 0) return answer(m, f, "vs", f->mode == 8 ? "tty" : "wayland", 0);
        if (strcmp(name, "Class") == 0) return answer(m, f, "vs", "user", 0);
        if (strcmp(name, "Seat") == 0) return answer(m, f, "v(so)", "seat0", 0);
        if (strcmp(name, "LockedHint") == 0) return answer(m, f, "vb", NULL, f->mode == 6);
    }
    uint8_t type;
    if (sd_bus_message_get_type(m, &type) >= 0 && type == SD_BUS_MESSAGE_METHOD_CALL) f->bad = 1;
    return 0;
}
static int one(int mode) {
    int fd[2];
    if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, fd) < 0) return 0;
    pid_t child = fork();
    if (child < 0) return 0;
    if (child == 0) {
        alarm(3);
        close(fd[0]);
        sd_bus *server = NULL;
        struct fixture f = { .mode = mode };
        sd_id128_t id = SD_ID128_MAKE(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16);
        if (sd_bus_new(&server) < 0 || sd_bus_set_fd(server, fd[1], fd[1]) < 0 ||
            sd_bus_set_server(server, 1, id) < 0 || sd_bus_add_filter(server, NULL, handler, &f) < 0 ||
            sd_bus_start(server) < 0) _exit(2);
        uint64_t end = now_us() + 2000000;
        while (now_us() < end) {
            int r = sd_bus_process(server, NULL);
            if (r < 0) break;
            if (r == 0) sd_bus_wait(server, 10000);
        }
        sd_bus_close(server); sd_bus_unref(server);
        _exit(f.bad || f.calls == 0 ? 2 : 0);
    }
    close(fd[1]);
    struct lc_context *c = calloc(1, sizeof(*c));
    c->uid = 1000; c->epoch = 1;
    memcpy(c->session, "fixture", 8);
    int setup = sd_bus_new(&c->bus);
    if (setup >= 0) setup = sd_bus_set_fd(c->bus, fd[0], fd[0]);
    if (setup >= 0) setup = sd_bus_start(c->bus);
    c->deadline_us = now_us() + QUERY_BUDGET_US;
    if (setup >= 0) setup = subscribe(c);
    /* A direct peer has no broker well-known-name resolver. Only this fixture
       supplies the known unique-owner equivalent of the production narrow
       login1 PropertiesChanged rule; the callback still checks exact owner/path. */
    if (setup >= 0) setup = sd_bus_add_match(c->bus, NULL,
        "type='signal',sender=':1.42',path_namespace='/org/freedesktop/login1/session',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'",
        property_change, c);
    struct lc_context_observation observed = {0};
    if (setup >= 0) sample_bound(c, &observed);
    lc_context_close(c);
    int status;
    waitpid(child, &status, 0);
    if (setup < 0 || !WIFEXITED(status) || WEXITSTATUS(status) != 0) return 0;
    if (mode == 1) return observed.status == LC_CONTEXT_UID_MISMATCH && observed.epoch > 1 && !observed.flags;
    if (mode == 2) return observed.status == LC_CONTEXT_OWNER_UNTRUSTED && observed.epoch > 1 && !observed.flags;
    if (mode == 3 || mode == 11 || mode == 12) return observed.status == LC_CONTEXT_MALFORMED && observed.epoch > 1 && !observed.flags;
    if (mode == 4) return observed.status == LC_CONTEXT_QUERY_DEADLINE && observed.epoch > 1 && !observed.flags;
    if (mode == 13) return observed.status == LC_CONTEXT_FLOOD && observed.epoch > 1 && !observed.flags;
    if (mode == 5 || mode == 10) return observed.status == LC_CONTEXT_INVALIDATED && observed.epoch > 1 && !observed.flags;
    if (observed.status != LC_CONTEXT_OK) return 0;
    if (mode == 6) return observed.flags & LC_HINT_LOCKED;
    if (mode == 7) return !(observed.flags & LC_LOCAL);
    if (mode == 8) return !(observed.flags & LC_GRAPHICAL);
    if (mode == 9) return !(observed.flags & LC_ACTIVE);
    return observed.flags == (LC_PID_BOUND | LC_UID_MATCHED | LC_ACTIVE | LC_LOCAL |
        LC_GRAPHICAL | LC_USER_CLASS | LC_SEAT0 | LC_HINT_KNOWN | LC_OWNER_ROOT);
}
int main(void) {
    clearenv();
    for (int mode = 0; mode <= 13; ++mode) {
        if (!one(mode)) { fprintf(stderr, "{\"code\":\"PRIVATE_CONTEXT_FIXTURE_FAILED\",\"case\":%d}\n", mode); return 3; }
    }
    puts("{\"privatePeerFixture\":true,\"casesPassed\":14,\"readMethodsOnly\":true}");
    return 0;
}
