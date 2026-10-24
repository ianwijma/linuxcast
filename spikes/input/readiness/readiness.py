"""Metadata selection proposals only. No device open, input or grant API."""
from dataclasses import dataclass, field
import hashlib
import hmac
import json
import re
import secrets
import time
from typing import Callable, Protocol

MAX_DEVICES = 128
METADATA_AGE_MS = 1000
PROPOSAL_AGE_MS = 5000
MIXED = ("ID_INPUT_MOUSE", "ID_INPUT_TOUCHPAD", "ID_INPUT_TOUCHSCREEN",
         "ID_INPUT_TABLET", "ID_INPUT_JOYSTICK", "ID_INPUT_ACCELEROMETER",
         "ID_INPUT_SWITCH")
PROPERTIES = ("ID_INPUT", "ID_INPUT_KEYBOARD", "ID_SEAT", "ID_BUS", "ID_PATH",
              "ID_SERIAL", *MIXED)


class Unavailable(Exception):
    def __init__(self):
        super().__init__("READINESS_METADATA_UNAVAILABLE")


@dataclass(frozen=True, repr=False)
class Metadata:
    # Private in-memory metadata. Never a public diagnostic or an open target.
    syspath: str
    devnode: str
    devnum: int
    name: str
    phys: str
    event_bits: str
    key_bits: str
    properties: tuple[tuple[str, str], ...]


def _text(value: object, maximum: int = 512) -> bool:
    return type(value) is str and len(value.encode("utf-8")) <= maximum and "\0" not in value


def _bits(value: str) -> int:
    # Fixed amd64 sysfs bitmap ABI: most-significant 64-bit word first.
    if not re.fullmatch(r"[0-9a-f]{1,16}(?: [0-9a-f]{1,16}){0,15}", value):
        raise Unavailable() from None
    words = value.split(" ")
    return int("".join(word.zfill(16) for word in words), 16)


def eligible_metadata(row: Metadata) -> bool:
    """Pure production filter; metadata eligibility never means capture eligibility."""
    if type(row) is not Metadata:
        return False
    if not all(_text(v) for v in (row.name, row.phys, row.event_bits, row.key_bits)):
        return False
    if not _text(row.syspath, 4096) or not re.fullmatch(r"/sys/devices/(?:[A-Za-z0-9_.:+-]+/)+event[0-9]+", row.syspath):
        return False
    if "/virtual/" in row.syspath or not _text(row.devnode) or not re.fullmatch(r"/dev/input/event[0-9]+", row.devnode):
        return False
    if type(row.devnum) is not int or not 0 < row.devnum < 2**64:
        return False
    if type(row.properties) is not tuple or len(row.properties) != len(PROPERTIES):
        return False
    if not all(type(pair) is tuple and len(pair) == 2 and _text(pair[0]) and _text(pair[1]) for pair in row.properties):
        return False
    p = dict(row.properties)
    if set(p) != set(PROPERTIES) or len(p) != len(row.properties):
        return False
    if p["ID_INPUT"] != "1" or p["ID_INPUT_KEYBOARD"] != "1":
        return False
    if any(p[key] not in ("", "0") for key in MIXED):
        return False
    if (p["ID_SEAT"] or "seat0") != "seat0":
        return False
    if p["ID_BUS"] not in ("usb", "bluetooth", "i8042") or not (p["ID_PATH"] or p["ID_SERIAL"]):
        return False
    if "linuxcast" in (row.name + " " + row.phys).lower() or not row.name or not row.phys:
        return False
    try:
        ev, keys = _bits(row.event_bits), _bits(row.key_bits)
        # No pointer/absolute/switch mixed device. Require the complete emergency
        # chord on this keyboard; this spike has no cross-device chord policy.
        return bool(ev & (1 << 1)) and not ev & ((1 << 2) | (1 << 3) | (1 << 5)) and all(keys & (1 << key) for key in (1, 28, 29, 30, 57, 97))
    except Unavailable:
        return False


def _fingerprint(row: Metadata) -> bytes:
    return hashlib.sha256(json.dumps([row.syspath, row.devnode, row.devnum,
        row.name, row.phys, row.event_bits, row.key_bits, sorted(row.properties)],
        ensure_ascii=True, separators=(",", ":")).encode()).digest()


class MetadataSource(Protocol):
    def scan(self) -> tuple[Metadata, ...]: ...


@dataclass(frozen=True, repr=False)
class ParentPeer:
    """Trusted parent seam, NOT decoded from a message or an authentication API.

    Parent retains its already kernel-authenticated accepted connection/pidfd,
    supplies its real UID and server generation, and checks lifetime/transport in
    alive(). No wire parser can construct this object. Fixtures inject this seam;
    this module does not claim to implement the parent authentication adapter.
    """
    uid: int
    generation: int
    expires_ms: int
    alive: Callable[[], bool] = field(repr=False)


@dataclass(frozen=True)
class Candidate:
    token: str
    generation: int
    transport: str


@dataclass(frozen=True, repr=False)
class Proposal:
    _token: str
    _generation: int
    _expires: int


class Catalog:
    def __init__(self, source: MetadataSource, peer: ParentPeer, *, clock=None):
        if type(peer) is not ParentPeer or type(peer.uid) is not int or not 0 < peer.uid < 2**32 or type(peer.generation) is not int or not 0 < peer.generation < 2**64 or type(peer.expires_ms) is not int:
            raise Unavailable()
        self._source, self._peer = source, peer
        self._clock = clock or (lambda: time.monotonic_ns() // 1_000_000)
        self._secret = secrets.token_bytes(32)
        self._last = -1
        self._epoch = 0
        self._invalid = False
        self._rows = {}
        self._at = -1
        self._proposal = None

    def _deny(self):
        self._invalid = True
        self._rows.clear()
        self._proposal = None
        raise Unavailable() from None

    def _check(self, peer):
        try:
            now = self._clock()
            if self._invalid or peer is not self._peer or type(now) is not int or now < self._last or now >= self._peer.expires_ms or self._peer.alive() is not True:
                self._deny()
            self._last = now
            return now
        except Exception:
            self._deny()

    def _scan(self, peer):
        begin = self._check(peer)
        try:
            rows = self._source.scan()
            end = self._check(peer)
            if type(rows) is not tuple or len(rows) > MAX_DEVICES or end - begin >= METADATA_AGE_MS:
                self._deny()
            # Duplicate nodes, paths or device numbers are ambiguous, including
            # duplicates that one of the other filters would otherwise discard.
            for attr in ("syspath", "devnode", "devnum"):
                values = [getattr(r, attr) for r in rows]
                if len(set(values)) != len(values):
                    self._deny()
            return tuple(row for row in rows if eligible_metadata(row)), end
        except Exception:
            self._deny()

    def candidates(self, peer: ParentPeer) -> tuple[Candidate, ...]:
        if self._proposal is not None:
            self._deny()  # Refresh cannot revive a selected/invalidated proposal.
        rows, self._at = self._scan(peer)
        if self._epoch >= 2**64 - 1:
            self._deny()
        self._epoch += 1
        self._rows = {}
        result = []
        for row in rows:
            token = hmac.new(self._secret, self._epoch.to_bytes(8, "big") + _fingerprint(row), hashlib.sha256).hexdigest()
            self._rows[token] = _fingerprint(row)
            result.append(Candidate(token, self._epoch, dict(row.properties)["ID_BUS"]))
        return tuple(result)

    def propose(self, wire: object, peer: ParentPeer) -> Proposal:
        now = self._check(peer)
        if type(wire) is not dict or set(wire) != {"token", "generation"} or type(wire["generation"]) is not int or wire["generation"] != self._epoch or type(wire["token"]) is not str or wire["token"] not in self._rows or now - self._at >= METADATA_AGE_MS or self._proposal is not None:
            self._deny()
        self._proposal = Proposal(wire["token"], self._epoch, min(now + PROPOSAL_AGE_MS, self._peer.expires_ms))
        self._validate(self._proposal, peer)
        return self._proposal

    def _validate(self, proposal, peer):
        now = self._check(peer)
        if proposal is not self._proposal or now >= proposal._expires or proposal._generation != self._epoch:
            self._deny()
        rows, end = self._scan(peer)
        if end >= proposal._expires or self._rows.get(proposal._token) not in {_fingerprint(row) for row in rows}:
            self._deny()

    def cancel(self):
        self._invalid = True
        self._rows.clear()
        self._proposal = None

    def assessment(self, proposal: Proposal, peer: ParentPeer) -> dict:
        try:
            self._validate(proposal, peer)
            reason = "AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE"
        except Unavailable:
            reason = "SELECTION_INVALIDATED"
        # Fixed engineering report only. Even untrusted claimed consent or
        # administrative authentication can never turn it into a capture grant.
        return {"reason": reason, "canCapture": False, "consentEstablished": False,
                "deviceOpenAvailable": False, "workerArmAvailable": False}
