"""Bounded, private Orca48.1 incremental observations. Never asserts delivery.

Only whole allowlisted utterances count. A dispatcher string diagnostic is not
an attempt: the SSML diagnostic immediately before _send_command is required.
See controller-protocol.md for the installed-source authority and limitations.
"""
import ast
import hashlib
import os
from pathlib import Path
import re
import stat


class OutputRejected(Exception):
    """No private text in diagnostics."""


LABELS = {
    "search": "Search commands", "public-result": "Public AT result Installed application",
    "public-alternate": "Public AT result alternate Installed application",
    "public-final": "Public AT filler 119 Installed application",
    "action-search": "Find an action", "alias-field": "Search alias",
    "save-alias": "Save alias", "cancel": "Cancel", "fallback-hide": "Hide",
    "application-heading": "Linuxcast", "loading": "Opening Linuxcast…",
    "error-heading": "Linuxcast could not connect",
}
# Exact complete alternatives, never suffix/substring matching. Unsupported
# native pronunciation is an unmet prerequisite, not automatically learned.
UTTERANCES = {identifier: {label} for identifier, label in LABELS.items()}
NEUTRAL = {"text", "entry", "button", "search text", "list", "selected", "1 of 2", "2 of 2", "1 of 20", "20 of 20"}
STAMP = r"(?:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]\.\d{6} - )?"
GENERATED = re.compile(STAMP + r"SPEECH OUTPUT: '([^'\r\n]*)' (\{[^\r\n]*\})")
ATTEMPT = re.compile(STAMP + r"SPEECH DISPATCHER: Speaking '<speak>([^'\r\n]*)</speak>' *")
STRING = re.compile(STAMP + r"SPEECH DISPATCHER: Speaking '([^'\r\n]*)' as string")
MARK = re.compile(r'<mark name="(\d{1,4}):(\d{1,4})"/>')
MAX_LOG = 8 * 1024 * 1024
MAX_SLICE = 256 * 1024
MAX_LINE = 8192


def voice_valid(text):
    try:
        value = ast.literal_eval(text)
    except (ValueError, SyntaxError, RecursionError):
        return False
    if type(value) is not dict or not value or len(value) > 5:
        return False
    for key, item in value.items():
        if key in {"rate", "gain", "average-pitch"}:
            if type(item) not in (int, float) or not 0 <= item <= 100:
                return False
        elif key == "family":
            if type(item) is not dict or set(item) - {"name", "lang", "dialect"}:
                return False
            if any(type(v) is not str or v not in {"", "default", "en", "en-US", "US", "en_US"}
                   for v in item.values()):
                return False
        else:
            return False
    return True


def unmark(text):
    # Validate ranges against the decoded label, not arbitrary XML stripping.
    marks = list(MARK.finditer(text))
    plain = MARK.sub("", text)
    if "<" in plain or ">" in plain or "&" in plain:
        raise OutputRejected("orca-record")
    previous = -1
    removed = 0
    for match in marks:
        start, end = map(int, match.groups())
        if (not previous < start < end <= len(plain) or match.start() - removed != start
                or start and not plain[start - 1].isspace() or end < len(plain) and not plain[end].isspace()):
            raise OutputRejected("orca-record")
        previous = start
        removed += match.end() - match.start()
    return plain


class FreshOutput:
    """Single-use offsets tied to inode plus a hashed, immutable prefix.

    Reads a bounded file through O_NOFOLLOW. Every incremental read revalidates
    the prior prefix, so truncate-and-regrow is rejected too. Partial final lines
    are buffered but can never make a checkpoint pass. No raw text is returned.
    """
    def __init__(self, path):
        self.path = Path(path)
        self.identity = None
        self.offset = 0
        self.digest = hashlib.sha256(b"").digest()
        self.verified_length = 0
        self.verified_digest = self.digest
        self.used = False
        self.identifier = None
        self.generated = False
        self.attempt = False

    def _read(self):
        try:
            fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1
                        or info.st_size > MAX_LOG):
                    raise OutputRejected("orca-file")
                data = stream.read(MAX_LOG + 1)
                if len(data) > MAX_LOG:
                    raise OutputRejected("orca-size")
            identity = (info.st_dev, info.st_ino)
            if self.identity is not None and identity != self.identity:
                raise OutputRejected("orca-replaced")
            if (len(data) < self.offset or hashlib.sha256(data[:self.offset]).digest() != self.digest
                    or len(data) < self.verified_length
                    or hashlib.sha256(data[:self.verified_length]).digest() != self.verified_digest):
                raise OutputRejected("orca-truncated")
            self.identity = identity
            self.verified_length = len(data)
            self.verified_digest = hashlib.sha256(data).digest()
            return data
        except OSError:
            raise OutputRejected("orca-file") from None

    def arm(self, identifier):
        if self.used or identifier not in UTTERANCES:
            raise OutputRejected("orca-offset")
        data = self._read()
        if data and not data.endswith(b"\n"):
            raise OutputRejected("orca-partial")
        self.offset = len(data)
        self.digest = hashlib.sha256(data).digest()
        self.identifier = identifier
        self.used = True

    def observe(self):
        if not self.used:
            raise OutputRejected("orca-offset")
        data = self._read()
        fresh = data[self.offset:]
        if len(fresh) > MAX_SLICE:
            raise OutputRejected("orca-size")
        if any(len(line) > MAX_LINE for line in fresh.split(b"\n")):
            raise OutputRejected("orca-size")
        try:
            text = fresh.decode("utf-8", errors="strict")
        except UnicodeError:
            raise OutputRejected("orca-record") from None
        # Reparse this one bounded step slice. No later step can reuse it.
        generated = attempted = False
        allowed = set().union(*UTTERANCES.values(), NEUTRAL)
        lines = text.split("\n")
        for line in lines[:-1]:
            match = GENERATED.fullmatch(line)
            attempt = ATTEMPT.fullmatch(line)
            diagnostic = STRING.fullmatch(line)
            if match:
                utterance = match[1]
                if not voice_valid(match[2]) or utterance not in allowed:
                    raise OutputRejected("orca-record")
                if utterance in UTTERANCES[self.identifier]:
                    if generated or attempted:
                        raise OutputRejected("orca-ambiguous")
                    generated = True
            elif attempt:
                utterance = unmark(attempt[1])
                if utterance not in allowed:
                    raise OutputRejected("orca-record")
                if utterance in UTTERANCES[self.identifier]:
                    if not generated or attempted:
                        raise OutputRejected("orca-order")
                    attempted = True
            elif diagnostic:
                if diagnostic[1] not in allowed:
                    raise OutputRejected("orca-record")
            elif "SPEECH OUTPUT:" in line or "SPEECH DISPATCHER:" in line:
                # Includes reconnect/errors, fabricated callback/completion and
                # malformed/foreign/suffix-bearing marker records.
                raise OutputRejected("orca-record")
        self.generated, self.attempt = generated, attempted
        return {"generated": generated, "attempt": attempted,
                "completion": False, "completeLines": not bool(lines[-1])}
