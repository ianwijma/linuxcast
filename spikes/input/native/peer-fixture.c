/* Separate no-device executable. Private pathname transport is real; session
   data and bus owner are mocks and cannot establish live logind authorization. */
#define LC_CONTEXT_FIXTURE_NO_MAIN
#include "context-fixture.c"
#include <sys/prctl.h>
#include <sys/un.h>
#include <dirent.h>
#include <limits.h>
struct client { pid_t pid, retainer; int accepted, control; };
static struct client connect_child(int retain) {
    struct client result = { .pid = -1, .retainer = -1, .accepted = -1, .control = -1 };
    char directory[] = "/tmp/linuxcast-peer-XXXXXX";
    if (!mkdtemp(directory)) return result;
    struct sockaddr_un address = { .sun_family = AF_UNIX };
    if (snprintf(address.sun_path, sizeof(address.sun_path), "%s/peer.sock", directory) >= (int)sizeof(address.sun_path)) return result;
    int listener = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    int control[2], ready[2];
    if (listener < 0 || pipe2(control, O_CLOEXEC) < 0 || pipe2(ready, O_CLOEXEC) < 0 ||
        bind(listener, (struct sockaddr *)&address, sizeof(address)) < 0 || listen(listener, 1) < 0) return result;
    pid_t child = fork();
    if (child == 0) {
        alarm(5);
        close(listener); close(control[1]); close(ready[0]);
        /* Crucially connect AFTER fork: a pre-fork socketpair would name its
           creator rather than this connector in SO_PEERCRED/SO_PEERPIDFD. */
        int stream = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
        if (connect(stream, (struct sockaddr *)&address, sizeof(address)) < 0) _exit(3);
        pid_t retainer = -1;
        if (retain) {
            retainer = fork();
            if (retainer == 0) { alarm(5); close(control[0]); close(ready[1]); for (;;) pause(); }
        }
        /* Forged principal bytes and an SCM_RIGHTS FD are deliberately queued.
           A metadata-only bind must neither parse them nor install the FD. */
        char forged[] = "{\"pid\":1,\"uid\":0}";
        struct iovec data = { .iov_base = forged, .iov_len = sizeof(forged) };
        union { struct cmsghdr align; char bytes[CMSG_SPACE(sizeof(int))]; } ancillary;
        memset(&ancillary, 0, sizeof(ancillary));
        struct msghdr message = { .msg_iov = &data, .msg_iovlen = 1,
            .msg_control = ancillary.bytes, .msg_controllen = sizeof(ancillary.bytes) };
        struct cmsghdr *header = CMSG_FIRSTHDR(&message);
        header->cmsg_level = SOL_SOCKET; header->cmsg_type = SCM_RIGHTS; header->cmsg_len = CMSG_LEN(sizeof(int));
        memcpy(CMSG_DATA(header), &ready[1], sizeof(int));
        if (sendmsg(stream, &message, MSG_NOSIGNAL) < 0 || write(ready[1], &retainer, sizeof(retainer)) != sizeof(retainer)) _exit(3);
        close(ready[1]);
        char command;
        if (read(control[0], &command, 1) == 1 && command == 'D') {
            shutdown(stream, SHUT_WR);
            read(control[0], &command, 1);
        }
        close(stream); _exit(0);
    }
    close(control[0]); close(ready[1]);
    result.pid = child; result.control = control[1];
    result.accepted = accept4(listener, NULL, NULL, SOCK_CLOEXEC);
    if (read(ready[0], &result.retainer, sizeof(result.retainer)) != sizeof(result.retainer)) result.pid = -1;
    close(ready[0]); close(listener); unlink(address.sun_path); rmdir(directory);
    return result;
}
static void cleanup_client(struct client *client) {
    if (client->accepted >= 0) close(client->accepted);
    if (client->control >= 0) close(client->control);
    if (client->pid > 0) { kill(client->pid, SIGKILL); waitpid(client->pid, NULL, 0); }
    if (client->retainer > 0) { kill(client->retainer, SIGKILL); waitpid(client->retainer, NULL, 0); }
}
static int fake_session(int pidfd, char **id) {
    (void)pidfd;
    *id = strdup("fixture");
    return *id ? 0 : -ENOMEM;
}
static int fake_uid(const char *id, uid_t *uid) {
    if (strcmp(id, "fixture") != 0 && strcmp(id, "different-fixture") != 0) return -ENODATA;
    *uid = getuid(); return 0;
}
static unsigned fd_count(void) {
    DIR *directory = opendir("/proc/self/fd");
    if (!directory) return 0;
    unsigned count = 0;
    while (readdir(directory)) ++count;
    closedir(directory); return count;
}
static struct lc_context *binding(struct client *client) {
    struct lc_context_observation initial;
    unsigned before = fd_count();
    struct lc_context *c = lc_context_open_peer(client->accepted, getuid(), &initial);
    if (!c) return NULL;
    if (c->peer_pid != client->pid || c->uid != getuid() ||
        !(fcntl(c->peer_pidfd, F_GETFD) & FD_CLOEXEC) ||
        !(fcntl(c->peer_socket, F_GETFD) & FD_CLOEXEC) || fd_count() != before + 2) {
        lc_context_close(c); return NULL;
    }
    c->peer_session_fn = fake_session; c->peer_uid_fn = fake_uid;
    return c;
}
static pid_t private_bus_mode(struct lc_context *c, pid_t expire, int mode) {
    int fd[2];
    if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, fd) < 0) return -1;
    pid_t child = fork();
    if (child == 0) {
        alarm(3); close(fd[0]);
        /* This server must not itself retain the client's monitor transport. */
        close(c->peer_socket);
        sd_bus *server = NULL;
        struct fixture fixture = { .mode = mode, .uid = getuid(), .expire_peer = expire, .expire_pidfd = c->peer_pidfd };
        sd_id128_t id = SD_ID128_MAKE(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16);
        if (sd_bus_new(&server) < 0 || sd_bus_set_fd(server, fd[1], fd[1]) < 0 ||
            sd_bus_set_server(server, 1, id) < 0 || sd_bus_add_filter(server, NULL, handler, &fixture) < 0 || sd_bus_start(server) < 0) _exit(3);
        uint64_t end = now_us() + 1000000;
        while (now_us() < end) {
            int r = sd_bus_process(server, NULL);
            if (r < 0) break;
            if (!r) sd_bus_wait(server, 10000);
        }
        sd_bus_close(server); sd_bus_unref(server);
        _exit(fixture.bad || !fixture.calls || fixture.expire_peer > 0 ? 3 : 0);
    }
    close(fd[1]);
    if (sd_bus_new(&c->bus) < 0 || sd_bus_set_fd(c->bus, fd[0], fd[0]) < 0 || sd_bus_start(c->bus) < 0) return -1;
    return child;
}
static pid_t private_bus(struct lc_context *c, pid_t expire) {
    return private_bus_mode(c, expire, 0);
}
static int export_negative_observation(void) {
    struct client peer = connect_child(0);
    struct lc_context *c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 3; }
    pid_t server = private_bus_mode(c, 0, 7); /* mocked Remote=true */
    if (server < 0) { lc_context_close(c); cleanup_client(&peer); return 3; }
    struct lc_context_observation value;
    lc_context_sample_peer(c, &value);
    int valid = value.status == LC_CONTEXT_OK && (value.flags & LC_PID_BOUND) &&
        !(value.flags & LC_LOCAL);
    lc_context_close(c); cleanup_client(&peer);
    int status; waitpid(server, &status, 0);
    if (!valid || !WIFEXITED(status) || WEXITSTATUS(status) != 0) return 3;
    printf("{\"epoch\":%llu,\"started_ms\":%llu,\"observed_ms\":%llu,\"flags\":%u,\"status\":%u}\n",
        (unsigned long long)value.epoch, (unsigned long long)value.started_ms,
        (unsigned long long)value.observed_ms, value.flags, value.status);
    return 0;
}
static int normal_and_retained_death(void) {
    struct client peer = connect_child(1);
    struct lc_context *c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    pid_t server = private_bus(c, 0);
    struct lc_context_observation before, after, again;
    lc_context_sample_peer(c, &before);
    kill(peer.pid, SIGKILL); waitpid(peer.pid, NULL, 0); peer.pid = -1;
    /* Descendant demonstrably remains alive and retains the connected stream. */
    int retained = kill(peer.retainer, 0) == 0;
    struct pollfd transport = { .fd = c->peer_socket, .events = POLLRDHUP };
    retained = retained && poll(&transport, 1, 0) == 0;
    lc_context_sample_peer(c, &after);
    struct client replacement = connect_child(0);
    struct lc_context *next = binding(&replacement);
    lc_context_sample_peer(c, &again);
    int valid = before.status == LC_CONTEXT_OK && before.flags && retained && next &&
        after.status == LC_CONTEXT_PEER_DEAD && !after.flags && after.epoch > before.epoch &&
        again.status == LC_CONTEXT_PEER_DEAD && !again.flags && again.epoch == after.epoch && peer_lifetime(next) == LC_CONTEXT_OK;
    lc_context_close(next); cleanup_client(&replacement);
    lc_context_close(c); cleanup_client(&peer);
    int status; waitpid(server, &status, 0);
    return valid && WIFEXITED(status) && WEXITSTATUS(status) == 0;
}
static int mid_query_death(void) {
    struct client peer = connect_child(1);
    struct lc_context *c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    pid_t server = private_bus(c, peer.pid);
    struct lc_context_observation value;
    lc_context_sample_peer(c, &value);
    int valid = value.status == LC_CONTEXT_PEER_DEAD && !value.flags && value.epoch > 1;
    lc_context_close(c); cleanup_client(&peer);
    int status; waitpid(server, &status, 0);
    return valid && WIFEXITED(status) && WEXITSTATUS(status) == 0;
}
static int changed_session(int pidfd, char **id) {
    (void)pidfd;
    *id = strdup("different-fixture");
    return *id ? 0 : -ENOMEM;
}
static int changed_uid(const char *id, uid_t *uid) {
    (void)id; *uid = getuid() == 0 ? 1 : 0; return 0;
}
static int binding_changes_terminal(void) {
    struct client peer = connect_child(0);
    struct lc_context *c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    memcpy(c->session, "fixture", 8);
    c->peer_session_fn = changed_session;
    struct lc_context_observation changed, again;
    lc_context_sample_peer(c, &changed);
    c->peer_session_fn = fake_session;
    lc_context_sample_peer(c, &again);
    int valid = changed.status == LC_CONTEXT_PEER_SESSION_CHANGED && !changed.flags && changed.epoch > 1 &&
        again.status == changed.status && !again.flags && again.epoch == changed.epoch;
    lc_context_close(c);
    c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    c->peer_uid_fn = changed_uid;
    lc_context_sample_peer(c, &changed);
    valid = valid && changed.status == LC_CONTEXT_UID_MISMATCH && !changed.flags && changed.epoch > 1;
    lc_context_close(c); cleanup_client(&peer);
    return valid;
}
static int denial_boundaries(void) {
    struct client peer = connect_child(0);
    struct lc_context_observation out;
    struct lc_context *wrong = lc_context_open_peer(peer.accepted, getuid() == 0 ? 1 : 0, &out);
    int valid = !wrong && out.status == LC_CONTEXT_UID_MISMATCH;
    struct lc_context *c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    struct lc_context unsupported = { .peer_socket = -1, .peer_pidfd = -1 };
    valid = valid && peer_capture(&unsupported, peer.accepted, getuid(), INT_MAX) == LC_CONTEXT_PEER_PIDFD_UNAVAILABLE;
    if (unsupported.peer_socket >= 0) close(unsupported.peer_socket);
    int pipes[2]; pipe2(pipes, O_CLOEXEC);
    wrong = lc_context_open_peer(pipes[0], getuid(), &out);
    valid = valid && !wrong && out.status == LC_CONTEXT_PEER_BINDING_INVALID;
    close(pipes[0]); close(pipes[1]);
    c->peer_session_fn = NULL;
    lc_context_sample_peer(c, &out);
    valid = valid && out.status == LC_CONTEXT_PEER_SESSION_UNSUPPORTED && !out.flags;
    lc_context_close(c);
    c = binding(&peer);
    if (!c) { cleanup_client(&peer); return 0; }
    write(peer.control, "D", 1);
    struct pollfd transport = { .fd = c->peer_socket, .events = POLLRDHUP };
    poll(&transport, 1, 500);
    lc_context_sample_peer(c, &out);
    valid = valid && out.status == LC_CONTEXT_PEER_DISCONNECTED && !out.flags && out.epoch > 1;
    lc_context_close(c); cleanup_client(&peer);
    return valid;
}
int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--denial-observation") == 0 && peer_environment_empty()) {
        alarm(5); return export_negative_observation();
    }
    if (argc == 2 && strcmp(argv[1], "--environment-denial") == 0) {
        struct lc_context_observation observation;
        struct lc_context *c = lc_context_open_peer(-1, getuid(), &observation);
        if (c || observation.status != LC_CONTEXT_ENVIRONMENT_UNTRUSTED) return 3;
        puts("{\"environmentRejectedBeforeBinding\":true}"); return 0;
    }
    if (argc != 1 || !peer_environment_empty()) return 3;
    (void)one; /* Existing own-session fixture stays separately executed. */
    alarm(10);
    if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) < 0) return 3;
    if (!normal_and_retained_death()) { puts("{\"code\":\"PEER_RETAINED_DEATH_FAILED\"}"); return 3; }
    if (!mid_query_death()) { puts("{\"code\":\"PEER_QUERY_RACE_FAILED\"}"); return 3; }
    if (!binding_changes_terminal()) { puts("{\"code\":\"PEER_SESSION_CHANGE_FAILED\"}"); return 3; }
    if (!denial_boundaries()) { puts("{\"code\":\"PEER_DENIAL_BOUNDARY_FAILED\"}"); return 3; }
    puts("{\"realPeerTransport\":true,\"mockSessionAndBus\":true,\"retainedSocketDeathDenied\":true,\"midQueryDeathDenied\":true,\"sameUidNonrevival\":true,\"sessionAndUidChangesTerminal\":true,\"wrongUidUnsupportedWrongFdDisconnectedDenied\":true,\"clientPrincipalAndRightsNotAccepted\":true}");
    return 0;
}
