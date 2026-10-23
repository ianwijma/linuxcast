"""Fixed libudev metadata calls only; importing never loads or enumerates udev."""
import ctypes as C
import os
import time
from readiness import Metadata, PROPERTIES, MAX_DEVICES, Unavailable

ENVIRONMENT = {"LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "PATH": "/usr/bin:/bin"}


class UdevMetadata:
    def scan(self) -> tuple[Metadata, ...]:
        # Python may add LC_CTYPE to an empty environment at startup. A fixed
        # explicit UTF-8 launch prevents that coercion; no mutation here.
        if dict(os.environ) != ENVIRONMENT or os.uname().machine != "x86_64":
            raise Unavailable()
        try:
            return self._scan_fixed()
        except Exception:
            raise Unavailable() from None

    def _scan_fixed(self):
        library = C.CDLL("/usr/lib/x86_64-linux-gnu/libudev.so.1")
        libc = C.CDLL(None)
        libc.strnlen.argtypes = [C.c_void_p, C.c_size_t]
        libc.strnlen.restype = C.c_size_t
        signatures = {
            "udev_new": ([], C.c_void_p),
            "udev_unref": ([C.c_void_p], C.c_void_p),
            "udev_enumerate_new": ([C.c_void_p], C.c_void_p),
            "udev_enumerate_unref": ([C.c_void_p], C.c_void_p),
            "udev_enumerate_add_match_subsystem": ([C.c_void_p, C.c_char_p], C.c_int),
            "udev_enumerate_add_match_property": ([C.c_void_p, C.c_char_p, C.c_char_p], C.c_int),
            "udev_enumerate_scan_devices": ([C.c_void_p], C.c_int),
            "udev_enumerate_get_list_entry": ([C.c_void_p], C.c_void_p),
            "udev_list_entry_get_next": ([C.c_void_p], C.c_void_p),
            "udev_list_entry_get_name": ([C.c_void_p], C.c_void_p),
            "udev_device_new_from_syspath": ([C.c_void_p, C.c_char_p], C.c_void_p),
            "udev_device_unref": ([C.c_void_p], C.c_void_p),
            "udev_device_get_devnode": ([C.c_void_p], C.c_void_p),
            "udev_device_get_devnum": ([C.c_void_p], C.c_ulong),
            "udev_device_get_is_initialized": ([C.c_void_p], C.c_int),
            "udev_device_has_current_tag": ([C.c_void_p, C.c_char_p], C.c_int),
            "udev_device_get_property_value": ([C.c_void_p, C.c_char_p], C.c_void_p),
            "udev_device_get_parent_with_subsystem_devtype": ([C.c_void_p, C.c_char_p, C.c_char_p], C.c_void_p),
            "udev_device_get_sysattr_value": ([C.c_void_p, C.c_char_p], C.c_void_p),
        }
        for name, (args, result) in signatures.items():
            function = getattr(library, name)
            function.argtypes, function.restype = args, result

        def text(pointer, maximum=512):
            if not pointer:
                return ""
            length = libc.strnlen(pointer, maximum + 1)
            if length > maximum:
                raise Unavailable()
            return C.string_at(pointer, length).decode("utf-8", errors="strict")

        started = time.monotonic()
        context, enumeration = library.udev_new(), None
        try:
            if not context:
                raise Unavailable()
            enumeration = library.udev_enumerate_new(context)
            if not enumeration or library.udev_enumerate_add_match_subsystem(enumeration, b"input") < 0 or library.udev_enumerate_add_match_property(enumeration, b"ID_INPUT_KEYBOARD", b"1") < 0 or library.udev_enumerate_scan_devices(enumeration) < 0:
                raise Unavailable()
            entry = library.udev_enumerate_get_list_entry(enumeration)
            rows = []
            while entry:
                if len(rows) >= MAX_DEVICES or time.monotonic() - started >= 1:
                    raise Unavailable()
                path = text(library.udev_list_entry_get_name(entry), 4096)
                # libudev may enumerate the input parent as well as event nodes.
                if not path.rsplit("/", 1)[-1].startswith("event"):
                    entry = library.udev_list_entry_get_next(entry)
                    continue
                device = library.udev_device_new_from_syspath(context, path.encode())
                if not device:
                    raise Unavailable()
                try:
                    if library.udev_device_get_is_initialized(device) != 1 or library.udev_device_has_current_tag(device, b"seat") != 1:
                        raise Unavailable()
                    parent = library.udev_device_get_parent_with_subsystem_devtype(device, b"input", None)
                    if not parent:
                        raise Unavailable()
                    attr = lambda key: text(library.udev_device_get_sysattr_value(parent, key))
                    rows.append(Metadata(path, text(library.udev_device_get_devnode(device)),
                        int(library.udev_device_get_devnum(device)), attr(b"name"), attr(b"phys"),
                        attr(b"capabilities/ev"), attr(b"capabilities/key"),
                        tuple((key, text(library.udev_device_get_property_value(device, key.encode()))) for key in PROPERTIES)))
                finally:
                    library.udev_device_unref(device)
                entry = library.udev_list_entry_get_next(entry)
            if time.monotonic() - started >= 1:
                raise Unavailable()
            return tuple(rows)
        except Exception:
            raise Unavailable() from None
        finally:
            if enumeration:
                library.udev_enumerate_unref(enumeration)
            if context:
                library.udev_unref(context)
