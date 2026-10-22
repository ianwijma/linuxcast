#ifndef LINUXCAST_CONTEXT_H
#define LINUXCAST_CONTEXT_H
#include <stdint.h>
/* No strings, paths, IDs, raw D-Bus data or errno text cross this bridge. */
struct lc_context;
struct lc_context_observation {
    uint64_t epoch;
    uint64_t started_ms;
    uint64_t observed_ms;
    uint32_t flags;
    uint32_t status;
};
enum lc_context_status {
    LC_CONTEXT_OK, LC_CONTEXT_NO_SESSION, LC_CONTEXT_UID_MISMATCH,
    LC_CONTEXT_BUS_UNAVAILABLE, LC_CONTEXT_QUERY_UNAVAILABLE,
    LC_CONTEXT_OWNER_UNTRUSTED, LC_CONTEXT_INVALIDATED,
    LC_CONTEXT_QUERY_DEADLINE, LC_CONTEXT_MALFORMED, LC_CONTEXT_FLOOD,
    LC_CONTEXT_PEER_PIDFD_UNAVAILABLE, LC_CONTEXT_PEER_DEAD,
    LC_CONTEXT_PEER_DISCONNECTED, LC_CONTEXT_PEER_BINDING_INVALID,
    LC_CONTEXT_PEER_SESSION_UNSUPPORTED, LC_CONTEXT_PEER_SESSION_CHANGED,
    LC_CONTEXT_ENVIRONMENT_UNTRUSTED
};
enum lc_context_flags {
    LC_PID_BOUND = 1, LC_UID_MATCHED = 2, LC_ACTIVE = 4, LC_LOCAL = 8,
    LC_GRAPHICAL = 16, LC_USER_CLASS = 32, LC_SEAT0 = 64,
    LC_HINT_KNOWN = 128, LC_HINT_LOCKED = 256, LC_OWNER_ROOT = 512
};
struct lc_context *lc_context_open(struct lc_context_observation *out);
void lc_context_sample(struct lc_context *context, struct lc_context_observation *out);
/* Metadata-only binding to a server-accepted socket. expected_uid is trusted
   server grant state, never a wire principal. Dedicated observer must launch
   with an empty environment and never mutate it. No input/control protocol exists. */
struct lc_context *lc_context_open_peer(int connected_socket, uint32_t expected_uid,
                                      struct lc_context_observation *out);
void lc_context_sample_peer(struct lc_context *context, struct lc_context_observation *out);
void lc_context_close(struct lc_context *context);
#endif
