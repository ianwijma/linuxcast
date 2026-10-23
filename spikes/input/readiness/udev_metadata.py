"""Fixed libudev metadata calls only; importing never loads or enumerates udev."""
import ctypes as C
import os
import time
from readiness import Metadata, PROPERTIES, MAX_DEVICES, Unavailable

ENVIRONMENT = {"LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "PATH": "/usr/bin:/bin"}


ADAPTER_STAGES = frozenset('CHILD_ADAPTER_' + name for name in (
    'ENVIRONMENT', 'LIBRARY', 'C_RUNTIME', 'SIGNATURES', 'CONTEXT',
    'ENUMERATION', 'SUBSYSTEM_FILTER', 'KEYBOARD_FILTER', 'SCAN', 'ENTRY',
    'TIME_OR_COUNT', 'DEVICE', 'INITIALIZED', 'SEAT', 'PARENT', 'METADATA',
    'CLEANUP'))


class UdevMetadata:
    def __init__(self, stage=None):
        if stage is not None and not callable(stage):
            raise Unavailable()
        self._stage = stage

    def _enter(self, value):
        # Trusted in-memory literal observer only; no values or native effects.
        if self._stage is not None:
            try:
                self._stage(value)
            except Exception:
                raise Unavailable() from None

    def scan(self) -> tuple[Metadata, ...]:
        # Python may add LC_CTYPE to an empty environment at startup. A fixed
        # explicit UTF-8 launch prevents that coercion; no mutation here.
        self._enter('CHILD_ADAPTER_ENVIRONMENT')
        if dict(os.environ) != ENVIRONMENT or os.uname().machine != "x86_64":
            raise Unavailable()
        try:
            return self._scan_fixed()
        except Exception:
            raise Unavailable() from None

    def _scan_fixed(self):
        self._enter('CHILD_ADAPTER_LIBRARY')
        library = C.CDLL("/usr/lib/x86_64-linux-gnu/libudev.so.1")
        self._enter('CHILD_ADAPTER_C_RUNTIME')
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
        self._enter('CHILD_ADAPTER_SIGNATURES')
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

        self._enter('CHILD_ADAPTER_TIME_OR_COUNT')
        started = time.monotonic()
        self._enter('CHILD_ADAPTER_CONTEXT')
        context, enumeration = library.udev_new(), None
        try:
            if not context:
                raise Unavailable()
            self._enter('CHILD_ADAPTER_ENUMERATION')
            enumeration = library.udev_enumerate_new(context)
            if not enumeration:
                raise Unavailable()
            self._enter('CHILD_ADAPTER_SUBSYSTEM_FILTER')
            if library.udev_enumerate_add_match_subsystem(enumeration, b"input") < 0:
                raise Unavailable()
            self._enter('CHILD_ADAPTER_KEYBOARD_FILTER')
            if library.udev_enumerate_add_match_property(enumeration, b"ID_INPUT_KEYBOARD", b"1") < 0:
                raise Unavailable()
            self._enter('CHILD_ADAPTER_SCAN')
            if library.udev_enumerate_scan_devices(enumeration) < 0:
                raise Unavailable()
            self._enter('CHILD_ADAPTER_ENTRY')
            entry = library.udev_enumerate_get_list_entry(enumeration)
            rows = []
            inspected = 0
            seen_paths = set()
            while entry:
                self._enter('CHILD_ADAPTER_TIME_OR_COUNT')
                if inspected >= MAX_DEVICES or time.monotonic() - started >= 1:
                    raise Unavailable()
                inspected += 1
                self._enter('CHILD_ADAPTER_ENTRY')
                path = text(library.udev_list_entry_get_name(entry), 4096)
                if path in seen_paths:
                    raise Unavailable()
                seen_paths.add(path)
                # libudev may enumerate the input parent as well as event nodes.
                if not path.rsplit("/", 1)[-1].startswith("event"):
                    entry = library.udev_list_entry_get_next(entry)
                    continue
                self._enter('CHILD_ADAPTER_DEVICE')
                device = library.udev_device_new_from_syspath(context, path.encode())
                if not device:
                    raise Unavailable()
                try:
                    self._enter('CHILD_ADAPTER_INITIALIZED')
                    initialized = library.udev_device_get_is_initialized(device)
                    if type(initialized) is not int or initialized not in (0, 1):
                        raise Unavailable()
                    # A public zero can include a collapsed library error. It
                    # never qualifies this device; it is not an error-free or
                    # complete-hardware-discovery claim. Other rows must pass
                    # every positive guard before any candidate is returned.
                    if initialized == 1:
                        self._enter('CHILD_ADAPTER_SEAT')
                        seat = library.udev_device_has_current_tag(device, b"seat")
                        if type(seat) is not int or seat not in (0, 1):
                            raise Unavailable()
                        if seat == 1:
                            self._enter('CHILD_ADAPTER_PARENT')
                            parent = library.udev_device_get_parent_with_subsystem_devtype(device, b"input", None)
                            if not parent:
                                raise Unavailable()
                            self._enter('CHILD_ADAPTER_METADATA')
                            attr = lambda key: text(library.udev_device_get_sysattr_value(parent, key))
                            rows.append(Metadata(path, text(library.udev_device_get_devnode(device)),
                                int(library.udev_device_get_devnum(device)), attr(b"name"), attr(b"phys"),
                                attr(b"capabilities/ev"), attr(b"capabilities/key"),
                                tuple((key, text(library.udev_device_get_property_value(device, key.encode()))) for key in PROPERTIES)))
                finally:
                    try:
                        library.udev_device_unref(device)
                    except BaseException:
                        self._enter('CHILD_ADAPTER_CLEANUP')
                        raise
                self._enter('CHILD_ADAPTER_ENTRY')
                entry = library.udev_list_entry_get_next(entry)
            self._enter('CHILD_ADAPTER_TIME_OR_COUNT')
            if time.monotonic() - started >= 1:
                raise Unavailable()
            return tuple(rows)
        except Exception:
            raise Unavailable() from None
        finally:
            if enumeration:
                try:
                    library.udev_enumerate_unref(enumeration)
                except BaseException:
                    self._enter('CHILD_ADAPTER_CLEANUP')
                    raise
            if context:
                try:
                    library.udev_unref(context)
                except BaseException:
                    self._enter('CHILD_ADAPTER_CLEANUP')
                    raise
