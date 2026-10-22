/* Fixed test-only process-pressure helper, never an extension payload/tool. */
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    pid_t children[100];
    unsigned count = 0;
    int denied = 0;
    for (; count < 100; ++count) {
        pid_t child = fork();
        if (child < 0) {
            denied = errno == EAGAIN;
            break;
        }
        if (child == 0) {
            for (;;) pause();
        }
        children[count] = child;
    }
    for (unsigned i = 0; i < count; ++i) kill(children[i], SIGTERM);
    for (unsigned i = 0; i < count; ++i) {
        while (waitpid(children[i], NULL, 0) < 0 && errno == EINTR) {}
    }
    printf("{\"threadCreationDenied\":%s,\"workers\":%u}\n", denied ? "true" : "false", count);
    return denied ? 0 : 1;
}
