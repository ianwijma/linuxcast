/* S0-03 reviewed ABI/policy bridge. Constants come from Debian/Linux headers. */
#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <linux/audit.h>
#include <linux/capability.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <libevdev/libevdev.h>
#include <libevdev/libevdev-uinput.h>

struct device {struct libevdev *input; struct libevdev_uinput *output; unsigned char emitted[KEY_MAX+1];};
static void silent_log(enum libevdev_log_priority p, void *data, const char *file, int line,
    const char *function, const char *format, va_list args) {
    (void)p;(void)data;(void)file;(void)line;(void)function;(void)format;(void)args;
}
void lc_silence(void) {libevdev_set_log_function(silent_log,NULL);}
int lc_caps_empty(void) {
    struct __user_cap_header_struct h={_LINUX_CAPABILITY_VERSION_3,0};
    struct __user_cap_data_struct d[2]={{0}};
    if (syscall(SYS_capget,&h,d)<0) return 0;
    if(d[0].effective|d[0].permitted|d[0].inheritable|d[1].effective|d[1].permitted|d[1].inheritable)return 0;
    for(unsigned cap=0;cap<=CAP_LAST_CAP;cap++)if(prctl(PR_CAP_AMBIENT,PR_CAP_AMBIENT_IS_SET,cap,0,0)!=0)return 0;
    return 1;
}
int lc_supervisor_caps(void) {
    struct __user_cap_header_struct h={_LINUX_CAPABILITY_VERSION_3,0};
    uint32_t allowed=(1U<<CAP_CHOWN)|(1U<<CAP_SETUID)|(1U<<CAP_SETGID)|(1U<<CAP_KILL);
    struct __user_cap_data_struct d[2]={{.effective=allowed,.permitted=allowed}};
    return syscall(SYS_capset,&h,d);
}
int lc_worker_policy(void) {
#if !defined(__x86_64__)
    errno=ENOTSUP; return -1;
#else
    if (!lc_caps_empty() || getuid()==0 || geteuid()==0) {errno=EPERM;return -1;}
    if (prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)<0) return -1;
    /* Strict allowlist after libevdev/uinput initialization. In particular no
       open/socket/exec/clone/io_uring/ptrace/mount capability can be regained.
       ioctl is required for grab/ungrab/state sync/device destruction only;
       inherited descriptors are narrowed to the two devices and one pipe. */
#define ALLOW(n) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,(n),0,1), BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
    struct sock_filter f[]={
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_X86_64,1,0),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
        ALLOW(SYS_read),ALLOW(SYS_write),ALLOW(SYS_close),ALLOW(SYS_recvmsg),ALLOW(SYS_sendmsg),
        ALLOW(SYS_recvfrom),ALLOW(SYS_sendto),ALLOW(SYS_poll),ALLOW(SYS_ppoll),
        ALLOW(SYS_clock_gettime),ALLOW(SYS_clock_nanosleep),ALLOW(SYS_nanosleep),
        ALLOW(SYS_futex),ALLOW(SYS_brk),ALLOW(SYS_mmap),ALLOW(SYS_munmap),ALLOW(SYS_mremap),
        ALLOW(SYS_mprotect),ALLOW(SYS_madvise),ALLOW(SYS_rt_sigaction),ALLOW(SYS_rt_sigprocmask),
        ALLOW(SYS_rt_sigreturn),ALLOW(SYS_sigaltstack),ALLOW(SYS_restart_syscall),
        ALLOW(SYS_getpid),ALLOW(SYS_gettid),ALLOW(SYS_getppid),ALLOW(SYS_getuid),ALLOW(SYS_geteuid),
        ALLOW(SYS_sched_yield),ALLOW(SYS_exit),ALLOW(SYS_exit_group),
        /* Restrict ioctl's request operand using the real input headers. */
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_ioctl,0,9),
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[1])),
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,EVIOCGRAB,6,0),
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,EVIOCGKEY((KEY_MAX+8)/8),5,0),
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,UI_DEV_DESTROY,4,0),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW),
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM)
    };
#undef ALLOW
    struct sock_fprog program={(unsigned short)(sizeof(f)/sizeof(f[0])),f};
    return prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&program);
#endif
}
int lc_validate(int fd,const char *phys) {
    struct libevdev *dev=NULL;
    if (libevdev_new_from_fd(fd,&dev)<0) return -1;
    const char *name=libevdev_get_name(dev),*actual=libevdev_get_phys(dev);
    int valid=name && actual && strcmp(name,"Linuxcast S0-03 synthetic source")==0 && strcmp(actual,phys)==0
        && libevdev_has_event_code(dev,EV_KEY,KEY_LEFTCTRL)
        && !libevdev_has_event_type(dev,EV_REL) && !libevdev_has_event_type(dev,EV_ABS);
    libevdev_free(dev); return valid?0:-1;
}
void *lc_prepare(int input,int output) {
    struct device *d=calloc(1,sizeof(*d)); if (!d) return NULL;
    if (libevdev_new_from_fd(input,&d->input)<0) {free(d);return NULL;}
    libevdev_set_name(d->input,"Linuxcast S0-03 passthrough virtual");
    libevdev_set_phys(d->input,"linuxcast-s0-03/passthrough");
    /* libevdev1.13.4 copies capabilities/name/IDs, not phys. Set the kernel
       identity explicitly on the handed-off uinput descriptor before CREATE. */
    if (ioctl(output,UI_SET_PHYS,"linuxcast-s0-03/passthrough")<0) {libevdev_free(d->input);free(d);return NULL;}
    if (libevdev_uinput_create_from_device(d->input,output,&d->output)<0) {libevdev_free(d->input);free(d);return NULL;}
    return d;
}
const char *lc_node(void *p) {return libevdev_uinput_get_devnode(((struct device *)p)->output);}
int lc_all_released(void *p) {
    unsigned char keys[(KEY_MAX+8)/8]={0};
    if (ioctl(libevdev_get_fd(((struct device *)p)->input),EVIOCGKEY(sizeof(keys)),keys)<0) return 0;
    for (unsigned i=0;i<sizeof(keys);i++) if (keys[i]) return 0;
    return 1;
}
int lc_grab(void *p) {
    struct device *d=p;
    if (!lc_all_released(p) || libevdev_grab(d->input,LIBEVDEV_GRAB)<0) return -1;
    if (!lc_all_released(p)) {libevdev_grab(d->input,LIBEVDEV_UNGRAB);return -1;}
    return 0;
}
int lc_next(void *p,struct input_event *event) {return libevdev_next_event(((struct device *)p)->input,LIBEVDEV_READ_FLAG_NORMAL,event);}
int lc_forward(void *p,const struct input_event *event) {
    struct device *d=p;
    /* Fixed synthetic lab devices have only EV_KEY/EV_SYN, no text conversion. */
    if (event->type!=EV_KEY && !(event->type==EV_SYN && event->code==SYN_REPORT)) return -1;
    if (event->type==EV_KEY && (event->code>KEY_MAX || event->value<0 || event->value>2)) return -1;
    int rc=libevdev_uinput_write_event(d->output,event->type,event->code,event->value);
    if (rc==0 && event->type==EV_KEY && event->value!=2) d->emitted[event->code]=(unsigned char)event->value;
    return rc;
}
void lc_destroy(void *p) {
    if (!p) return;
    struct device *d=p;
    for (unsigned code=0;code<=KEY_MAX;code++) if (d->emitted[code]) libevdev_uinput_write_event(d->output,EV_KEY,code,0);
    libevdev_uinput_write_event(d->output,EV_SYN,SYN_REPORT,0);
    libevdev_grab(d->input,LIBEVDEV_UNGRAB);
    libevdev_uinput_destroy(d->output); libevdev_free(d->input);free(d);
}
/* Lab-only manufacturer. No physical keyboard is enumerated or opened. */
void *lc_synthetic(int uinput,const char *phys) {
    struct libevdev *d=libevdev_new(); if(!d)return NULL;
    libevdev_set_name(d,"Linuxcast S0-03 synthetic source");libevdev_set_phys(d,phys);
    libevdev_set_id_bustype(d,BUS_VIRTUAL);
    if(ioctl(uinput,UI_SET_PHYS,phys)<0){libevdev_free(d);return NULL;}
    const unsigned codes[]={KEY_LEFTCTRL,KEY_RIGHTCTRL,KEY_ESC,KEY_LEFTSHIFT,KEY_RIGHTSHIFT,KEY_LEFTALT,KEY_RIGHTALT,KEY_LEFTMETA,KEY_RIGHTMETA,KEY_F24};
    for(unsigned i=0;i<sizeof(codes)/sizeof(codes[0]);i++) if(libevdev_enable_event_code(d,EV_KEY,codes[i],NULL)<0){libevdev_free(d);return NULL;}
    struct libevdev_uinput *ui=NULL;int rc=libevdev_uinput_create_from_device(d,uinput,&ui);libevdev_free(d);return rc<0?NULL:ui;
}
const char *lc_synthetic_node(void *p){return libevdev_uinput_get_devnode(p);}
int lc_emit(void *p,unsigned code,int value){int a=libevdev_uinput_write_event(p,EV_KEY,code,value);int b=libevdev_uinput_write_event(p,EV_SYN,SYN_REPORT,0);return a<0?a:b;}
void lc_synthetic_destroy(void *p){if(p)libevdev_uinput_destroy(p);}
int lc_regrab(int fd){if(ioctl(fd,EVIOCGRAB,1)<0)return -1;return ioctl(fd,EVIOCGRAB,0);}
int lc_key_down(int fd,unsigned key){unsigned char keys[(KEY_MAX+8)/8]={0};if(key>KEY_MAX||ioctl(fd,EVIOCGKEY(sizeof(keys)),keys)<0)return -1;return !!(keys[key/8]&(1U<<(key%8)));}
int lc_removed(int fd){unsigned char keys[(KEY_MAX+8)/8]={0};return ioctl(fd,EVIOCGKEY(sizeof(keys)),keys)<0&&errno==ENODEV;}
/* Non-device subprocess check: each request must fail at the syscall policy,
   before filesystem lookup, socket creation, process creation or execution. */
int lc_policy_probe(void){
    const char *args[]={"/linuxcast-nonexistent-policy-probe",NULL};
    if(open("/linuxcast-nonexistent-policy-probe",O_RDONLY)!=-1||errno!=EPERM)return 0;
    if(syscall(SYS_socket,AF_UNIX,SOCK_STREAM,0)!=-1||errno!=EPERM)return 0;
    if(syscall(SYS_clone3,NULL,0)!=-1||errno!=EPERM)return 0;
    if(syscall(SYS_execve,args[0],args,NULL)!=-1||errno!=EPERM)return 0;
    if(ioctl(-1,0)!=-1||errno!=EPERM)return 0;
    return 1;
}
