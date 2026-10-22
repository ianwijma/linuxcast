/* Build-only x86_64 policy emitter. Numbers come from the installed Linux UAPI,
 * never a handwritten syscall table. No extension/native-addon code is loaded. */
#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/sched.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <asm/unistd.h>

#if !defined(__x86_64__)
#error "S0-04 policy is reviewed only for the amd64 target"
#endif

#define DENY(number) \
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, number, 0, 1), \
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)

int main(void) {
    const struct sock_filter policy[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        /* x32 shares the architecture value, but not the reviewed syscall ABI. */
        BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, __X32_SYSCALL_BIT, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        DENY(SYS_socket), /* all direct network/Unix socket access uses broker */
        DENY(SYS_ptrace), DENY(SYS_process_vm_readv), DENY(SYS_process_vm_writev),
        DENY(SYS_mount), DENY(SYS_umount2), DENY(SYS_pivot_root),
        DENY(SYS_unshare), DENY(SYS_setns), DENY(SYS_open_by_handle_at),
        DENY(SYS_bpf), DENY(SYS_perf_event_open), DENY(SYS_userfaultfd),
        DENY(SYS_keyctl), DENY(SYS_add_key), DENY(SYS_request_key),
        DENY(SYS_kexec_load), DENY(SYS_kexec_file_load), DENY(SYS_reboot),
        DENY(SYS_init_module), DENY(SYS_finit_module), DENY(SYS_delete_module),
        DENY(SYS_swapon), DENY(SYS_swapoff), DENY(SYS_io_uring_setup),
        DENY(SYS_fsopen), DENY(SYS_fsconfig), DENY(SYS_fsmount),
        DENY(SYS_open_tree), DENY(SYS_move_mount), DENY(SYS_mount_setattr),
        /* glibc falls back to clone when clone3 is unavailable. Its pointer
         * argument prevents safely inspecting namespace flags in classic BPF. */
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_clone3, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ENOSYS),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_clone, 0, 3),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K,
            CLONE_NEWUSER | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWPID |
            CLONE_NEWIPC | CLONE_NEWUTS | CLONE_NEWCGROUP, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    return fwrite(policy, sizeof(policy), 1, stdout) == 1 ? 0 : 1;
}
