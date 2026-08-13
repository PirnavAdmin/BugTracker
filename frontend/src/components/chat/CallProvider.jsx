import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Camera,
  CameraOff,
  Hand,
  Minus,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  UsersRound,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getChatSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

const CallContext = createContext(null);
const getId = (value) => String(value?._id || value?.id || value || "");
const getDescriptionKey = (description = {}) =>
  `${description.type || ""}:${description.sdp || ""}`;
const getCandidateKey = (candidate = {}) =>
  [
    candidate.candidate || "",
    candidate.sdpMid || "",
    candidate.sdpMLineIndex ?? "",
    candidate.usernameFragment || "",
  ].join("|");
const getCandidateSummary = (candidate = {}) => {
  const text = candidate.candidate || "";
  const parts = text.split(" ");

  return {
    candidateType: candidate.type || parts[7] || "",
    protocol: candidate.protocol || parts[2] || "",
    address: candidate.address || parts[4] || "",
    port: candidate.port || parts[5] || "",
  };
};
const isLiveTrack = (track) => track?.readyState === "live";
const hasLiveTrack = (stream, kind) =>
  Boolean(stream?.getTracks().some((track) => track.kind === kind && isLiveTrack(track)));
const getVideoSender = (peer) =>
  peer
    ?.getSenders?.()
    ?.find((sender) => sender.track?.kind === "video") ||
  peer
    ?.getTransceivers?.()
    ?.find(
      (transceiver) =>
        transceiver?.sender &&
        (transceiver.sender.track?.kind === "video" ||
          transceiver.receiver?.track?.kind === "video")
    )?.sender ||
  null;
const callLog = (message, details = null) => {
  if (details === null || details === undefined) {
    console.log(`[Call] ${message}`);
    return;
  }
  console.log(`[Call] ${message}`, details);
};

const configuredTurnUrl = import.meta.env.VITE_TURN_URL || "";
const turnUrls = configuredTurnUrl
  ? [
      configuredTurnUrl,
      ...(configuredTurnUrl.includes("transport=udp")
        ? [configuredTurnUrl.replace("transport=udp", "transport=tcp")]
        : []),
    ]
  : [];

const rtcConfig = {
  iceServers: [
    { urls: import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302" },
    ...(turnUrls.length
      ? [
          {
            urls: turnUrls,
            username: import.meta.env.VITE_TURN_USERNAME || "",
            credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
          },
        ]
      : []),
  ],
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 8,
  iceTransportPolicy: import.meta.env.VITE_ICE_TRANSPORT_POLICY || "all",
};

const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const RINGTONE_START_SECONDS = 15;
const RINGTONE_URL = `${import.meta.env.BASE_URL}audio/incoming-call.mp3`;

const playRingtone = () => {
  const audio = new Audio(RINGTONE_URL);
  let stopped = false;

  audio.preload = "auto";

  const playFromRingtoneStart = () => {
    if (stopped) return;

    audio.currentTime =
      Number.isFinite(audio.duration) && audio.duration > RINGTONE_START_SECONDS
        ? RINGTONE_START_SECONDS
        : 0;
    audio.play().catch((playError) => {
      callLog("ringtone autoplay blocked", playError?.message || playError);
    });
  };

  audio.addEventListener("loadedmetadata", playFromRingtoneStart, { once: true });
  audio.addEventListener("ended", playFromRingtoneStart);
  audio.load();

  return () => {
    stopped = true;
    audio.removeEventListener("loadedmetadata", playFromRingtoneStart);
    audio.removeEventListener("ended", playFromRingtoneStart);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };
};

const RemoteMedia = ({
  stream,
  muted,
  onVideoStalled,
  onVideoStateChange,
  user = null,
  name = "Participant",
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    let stallTimerId;
    let lastVideoTime = 0;
    let unchangedTicks = 0;
    const updateHasVideo = () => {
      const nextHasVideo = Boolean(
        stream?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted)
      );
      setHasVideo(nextHasVideo);
      onVideoStateChange?.(nextHasVideo);
    };

    const playElement = (element, label) => {
      element?.play?.().catch((playError) => {
        callLog(`remote ${label} autoplay blocked`, playError?.message || playError);
      });
    };
    const resumeRemotePlayback = () => {
      updateHasVideo();
      if (audioRef.current) {
        audioRef.current.muted = muted;
        playElement(audioRef.current, "audio");
      }
      if (videoRef.current && hasLiveTrack(stream, "video")) {
        playElement(videoRef.current, "video");
      }
    };

    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        playElement(videoRef.current, "video");
        updateHasVideo();
      };
      playElement(videoRef.current, "video");
    }
    if (audioRef.current) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
      audioRef.current.muted = muted;
      playElement(audioRef.current, "audio");
    }
    const watchedTracks = stream?.getTracks() || [];
    watchedTracks.forEach((track) => {
      track.addEventListener?.("mute", resumeRemotePlayback);
      track.addEventListener?.("unmute", resumeRemotePlayback);
      track.addEventListener?.("ended", resumeRemotePlayback);
    });
    updateHasVideo();
    stream?.addEventListener?.("addtrack", resumeRemotePlayback);
    stream?.addEventListener?.("removetrack", resumeRemotePlayback);
    audioRef.current?.addEventListener?.("loadedmetadata", resumeRemotePlayback);
    audioRef.current?.addEventListener?.("canplay", resumeRemotePlayback);
    stallTimerId = window.setInterval(() => {
      const element = videoRef.current;
      if (!element || element.paused || !hasLiveTrack(stream, "video")) {
        unchangedTicks = 0;
        return;
      }
      if (element.currentTime === lastVideoTime) {
        unchangedTicks += 1;
      } else {
        unchangedTicks = 0;
        lastVideoTime = element.currentTime;
      }
      if (unchangedTicks >= 4) {
        callLog("remote video appears stalled", {
          currentTime: element.currentTime,
          readyState: element.readyState,
          videoWidth: element.videoWidth,
          videoHeight: element.videoHeight,
        });
        playElement(element, "video");
        updateHasVideo();
        onVideoStalled?.();
        unchangedTicks = 0;
      }
    }, 2000);

    return () => {
      window.clearInterval(stallTimerId);
      watchedTracks.forEach((track) => {
        track.removeEventListener?.("mute", resumeRemotePlayback);
        track.removeEventListener?.("unmute", resumeRemotePlayback);
        track.removeEventListener?.("ended", resumeRemotePlayback);
      });
      stream?.removeEventListener?.("addtrack", resumeRemotePlayback);
      stream?.removeEventListener?.("removetrack", resumeRemotePlayback);
      audioRef.current?.removeEventListener?.("loadedmetadata", resumeRemotePlayback);
      audioRef.current?.removeEventListener?.("canplay", resumeRemotePlayback);
    };
  }, [muted, onVideoStalled, onVideoStateChange, stream]);

  return (
    <>
      {!hasVideo ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-800 text-white">
          <UserAvatar
            user={user}
            name={name}
            className="h-24 w-24 rounded-2xl border border-white/15"
            fallbackClassName="text-3xl"
          />
          <div className="text-center">
            <p className="text-sm font-bold text-white/90">{name}</p>
            <p className="text-xs font-semibold text-white/45">Camera is off</p>
          </div>
        </div>
      ) : null}
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      <audio ref={audioRef} autoPlay playsInline />
    </>
  );
};

const RemoteAudioSink = ({ stream, muted }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return undefined;
    }

    const playAudio = () => {
      audio.muted = muted;
      audio.play?.().catch((playError) => {
        callLog("minimized remote audio autoplay blocked", playError?.message || playError);
      });
    };

    if (audio.srcObject !== stream) {
      audio.srcObject = stream || null;
    }

    playAudio();
    audio.addEventListener("loadedmetadata", playAudio);
    audio.addEventListener("canplay", playAudio);
    stream?.addEventListener?.("addtrack", playAudio);
    stream?.addEventListener?.("removetrack", playAudio);

    return () => {
      audio.removeEventListener("loadedmetadata", playAudio);
      audio.removeEventListener("canplay", playAudio);
      stream?.removeEventListener?.("addtrack", playAudio);
      stream?.removeEventListener?.("removetrack", playAudio);
      audio.pause?.();
      audio.srcObject = null;
    };
  }, [muted, stream]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

const LocalVideo = ({ stream, user, showVideo = true, compact = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && showVideo) {
      videoRef.current.srcObject = stream;
      videoRef.current.play?.().catch(() => {});
    }
  }, [showVideo, stream]);

  if (!showVideo) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center bg-slate-800 text-white",
          compact ? "gap-0" : "gap-3"
        )}
      >
        <UserAvatar
          user={user}
          className={cn(
            "rounded-2xl border border-white/15",
            compact ? "h-20 w-20" : "h-24 w-24"
          )}
          fallbackClassName={compact ? "text-2xl" : "text-3xl"}
        />
        <div className={cn("text-center", compact && "sr-only")}>
          <p className="text-sm font-bold text-white/90">You</p>
          <p className="text-xs font-semibold text-white/45">Camera is off</p>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="h-full w-full object-cover"
    />
  );
};

const ParticipantPlaceholder = ({
  user = null,
  name = "Participant",
  subtitle = "Camera is off",
  compact = false,
}) => (
  <div
    className={cn(
      "flex h-full flex-col items-center justify-center gap-3 bg-slate-800 text-white",
      compact && "gap-2"
    )}
  >
    <UserAvatar
      user={user}
      name={name}
      className={cn(
        "rounded-2xl border border-white/15",
        compact ? "h-16 w-16" : "h-28 w-28"
      )}
      fallbackClassName={compact ? "text-xl" : "text-3xl"}
    />
    <div className="text-center">
      <p className={cn("font-bold text-white/90", compact ? "text-xs" : "text-lg")}>{name}</p>
      <p className={cn("font-semibold text-white/45", compact ? "text-[11px]" : "text-sm")}>
        {subtitle}
      </p>
    </div>
  </div>
);

const getPeerUiStatus = (state = "") => {
  if (["connected", "completed"].includes(state)) {
    return "Connected";
  }

  if (["disconnected", "failed"].includes(state)) {
    return "Reconnecting";
  }

  return "Connecting";
};

const getCallStatusLabel = (call, duration) => {
  if (!call) {
    return "";
  }

  if (call.status === "ringing") {
    return "Ringing";
  }

  if (call.status === "connected") {
    return duration > 0 ? formatDuration(duration) : "Connected";
  }

  return "Connecting";
};

export const CallProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [channelCalls, setChannelCalls] = useState({});
  const [callPresence, setCallPresence] = useState({});
  const [participants, setParticipants] = useState([]);
  const [raisedHands, setRaisedHands] = useState({});
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [screenSharers, setScreenSharers] = useState({});
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peerStatuses, setPeerStatuses] = useState({});
  const peersRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const processedCandidatesRef = useRef(new Map());
  const processedOffersRef = useRef(new Map());
  const processedAnswersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const outboundVideoTrackRef = useRef(null);
  const stopRingtoneRef = useRef(null);
  const activeCallRef = useRef(null);
  const screenRef = useRef(null);
  const callFrameRef = useRef(null);
  const stageRef = useRef(null);
  const negotiatingPeersRef = useRef(new Set());
  const restartingPeersRef = useRef(new Set());
  const makingOfferRef = useRef(new Map());
  const ignoredOfferRef = useRef(new Map());
  const mediaRequestRef = useRef(null);
  const mediaKindRef = useRef(null);
  const remoteStreamVersionsRef = useRef(new Map());
  const videoStallTimersRef = useRef(new Map());

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const updateRemoteStream = useCallback((userId, stream) => {
    const normalizedUserId = String(userId);
    const version = (remoteStreamVersionsRef.current.get(normalizedUserId) || 0) + 1;
    remoteStreamVersionsRef.current.set(normalizedUserId, version);
    setRemoteStreams((current) => ({
      ...current,
      [normalizedUserId]: {
        stream,
        version,
      },
    }));
  }, []);

  const cleanupPeer = useCallback((userId) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onsignalingstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.onconnectionstatechange = null;
      peer.onnegotiationneeded = null;
    }
    peer?.close();
    peersRef.current.delete(userId);
    pendingCandidatesRef.current.delete(userId);
    processedCandidatesRef.current.delete(userId);
    processedOffersRef.current.delete(userId);
    processedAnswersRef.current.delete(userId);
    makingOfferRef.current.delete(userId);
    ignoredOfferRef.current.delete(userId);
    restartingPeersRef.current.delete(userId);
    window.clearTimeout(videoStallTimersRef.current.get(userId));
    videoStallTimersRef.current.delete(userId);
    setPeerStatuses((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    negotiatingPeersRef.current.delete(userId);
  }, []);

  const cleanupAllPeers = useCallback(() => {
    peersRef.current.forEach((peer) => {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onsignalingstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.onconnectionstatechange = null;
      peer.onnegotiationneeded = null;
      peer.close();
    });
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    processedCandidatesRef.current.clear();
    processedOffersRef.current.clear();
    processedAnswersRef.current.clear();
    makingOfferRef.current.clear();
    ignoredOfferRef.current.clear();
    negotiatingPeersRef.current.clear();
    restartingPeersRef.current.clear();
    videoStallTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    videoStallTimersRef.current.clear();
    remoteStreamVersionsRef.current.clear();
    setRemoteStreams({});
    setPeerStatuses({});
  }, []);

  const stopStreams = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    cameraTrackRef.current = null;
    outboundVideoTrackRef.current = null;
    screenRef.current = null;
    mediaRequestRef.current = null;
    mediaKindRef.current = null;
    setLocalStream(null);
    setIsScreenSharing(false);
    setScreenSharers({});
  }, []);

  const applyQueuedCandidates = useCallback(async (userId, peer) => {
    const normalizedUserId = String(userId);
    const queuedCandidates = pendingCandidatesRef.current.get(normalizedUserId) || [];

    if (!peer?.remoteDescription || !queuedCandidates.length) {
      return;
    }

    callLog("applying queued ICE candidates", {
      fromUserId: normalizedUserId,
      count: queuedCandidates.length,
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
    });

    for (const candidate of queuedCandidates) {
      const candidateKey = getCandidateKey(candidate);
      const processedSet =
        processedCandidatesRef.current.get(normalizedUserId) || new Set();

      if (processedSet.has(candidateKey)) {
        callLog("skipping duplicate queued ICE candidate", {
          fromUserId: normalizedUserId,
          candidateKey,
        });
        continue;
      }

      try {
        await peer.addIceCandidate(candidate);
        processedSet.add(candidateKey);
        processedCandidatesRef.current.set(normalizedUserId, processedSet);
        callLog("queued ICE candidate applied", {
          fromUserId: normalizedUserId,
          ...getCandidateSummary(candidate),
        });
      } catch (candidateError) {
        callLog("queued ICE candidate failed", {
          fromUserId: normalizedUserId,
          error: candidateError?.message || candidateError,
        });
      }
    }

    pendingCandidatesRef.current.delete(normalizedUserId);
  }, []);

  const negotiatePeer = useCallback(
    async (targetUserId, options = {}) => {
      const currentCall = activeCallRef.current;
      const peer = peersRef.current.get(String(targetUserId));

      if (!currentCall?.callId || !peer || peer.connectionState === "closed") {
        return;
      }

      if (peer.signalingState !== "stable" || negotiatingPeersRef.current.has(String(targetUserId))) {
        callLog("skipping negotiation while peer is not stable", {
          targetUserId,
          signalingState: peer.signalingState,
        });
        return;
      }

      negotiatingPeersRef.current.add(String(targetUserId));
      makingOfferRef.current.set(String(targetUserId), true);
      try {
        const offer = await peer.createOffer(options);
        callLog(options.iceRestart ? "offer created for ICE restart" : "offer created", {
          targetUserId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
        if (peer.signalingState !== "stable") {
          callLog("offer discarded because signaling state changed", {
            targetUserId,
            signalingState: peer.signalingState,
          });
          return;
        }
        await peer.setLocalDescription(offer);
        callLog("local offer set", {
          targetUserId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
        getChatSocket(token)?.emit("call:offer", {
          callId: currentCall.callId,
          targetUserId: String(targetUserId),
          description: peer.localDescription || offer,
          iceRestart: Boolean(options.iceRestart),
        });
      } catch (error) {
        callLog("offer negotiation failed", { targetUserId, error });
      } finally {
        makingOfferRef.current.set(String(targetUserId), false);
        negotiatingPeersRef.current.delete(String(targetUserId));
      }
    },
    [token]
  );

  const syncPeerVideoTrack = useCallback(
    async (nextTrack, fallbackStream = null, options = {}) => {
      const { renegotiate = true } = options;
      const updates = [];

      peersRef.current.forEach((peer, targetUserId) => {
        const sender = getVideoSender(peer);
        if (sender) {
          updates.push(
            sender.replaceTrack(nextTrack).catch((replaceError) => {
              callLog("video replaceTrack failed", {
                targetUserId,
                hasTrack: Boolean(nextTrack),
                error: replaceError?.message || replaceError,
              });
            })
          );
          return;
        }

        if (nextTrack && fallbackStream) {
          peer.addTrack(nextTrack, fallbackStream);
          if (renegotiate) {
            updates.push(
              Promise.resolve().then(() => negotiatePeer(targetUserId)).catch((error) => {
                callLog("video renegotiation after addTrack failed", {
                  targetUserId,
                  error: error?.message || error,
                });
              })
            );
          }
        }
      });

      await Promise.allSettled(updates);

      if (!renegotiate) {
        return;
      }

      const renegotiations = [];
      peersRef.current.forEach((_peer, targetUserId) => {
        renegotiations.push(
          Promise.resolve().then(() => negotiatePeer(targetUserId)).catch((error) => {
            callLog("video renegotiation failed", {
              targetUserId,
              hasTrack: Boolean(nextTrack),
              error: error?.message || error,
            });
          })
        );
      });
      await Promise.allSettled(renegotiations);
    },
    [negotiatePeer]
  );

  const closeCallUi = useCallback(() => {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    cleanupAllPeers();
    stopStreams();
    setIncomingCall(null);
    setActiveCall(null);
    setParticipants([]);
    setRaisedHands({});
    setDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOff(false);
    setIsMinimized(false);
  }, [cleanupAllPeers, stopStreams]);

  const notifyIncomingCall = useCallback((call) => {
    if (!("Notification" in window)) {
      return;
    }

    const title =
      call.scope === "group"
        ? `${call.channelName || "Group channel"} call`
        : `${call.caller?.name || "Someone"} is calling`;
    const showNotification = () =>
      new Notification(title, {
        body: `${call.callType === "video" ? "Video" : "Audio"} call`,
      });

    if (Notification.permission === "granted") {
      showNotification();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          showNotification();
        }
      });
    }
  }, []);

  const attachLocalTrackHandlers = useCallback((track) => {
    if (!track || track.__bugTrackerHandled) {
      return;
    }

    track.__bugTrackerHandled = true;
    track.enabled = track.enabled !== false;
    track.addEventListener?.("ended", () => {
      callLog("local media track ended", {
        kind: track.kind,
        label: track.label,
        readyState: track.readyState,
      });
      if (track.kind === "audio") {
        setIsMuted(true);
      }
      if (track.kind === "video" && outboundVideoTrackRef.current === track) {
        setIsCameraOff(true);
      }
    });
    track.addEventListener?.("mute", () => {
      callLog("local media track muted by browser", { kind: track.kind, label: track.label });
    });
    track.addEventListener?.("unmute", () => {
      callLog("local media track unmuted by browser", { kind: track.kind, label: track.label });
    });
  }, []);

  const getMedia = useCallback(async (callType) => {
    const needsVideo = callType === "video";
    let existingStream = localStreamRef.current;

    if (!needsVideo && hasLiveTrack(existingStream, "video")) {
      existingStream.getVideoTracks().forEach((track) => {
        track.stop();
        existingStream.removeTrack?.(track);
      });
      localStreamRef.current = existingStream;
      cameraTrackRef.current = null;
      if (!isScreenSharing) {
        outboundVideoTrackRef.current = null;
      }
      setIsCameraOff(true);
      setLocalStream(new MediaStream(existingStream.getTracks().filter(isLiveTrack)));
    }

    const existingHasAudio = hasLiveTrack(existingStream, "audio");
    const existingHasVideo = hasLiveTrack(existingStream, "video");

    if (existingHasAudio && (!needsVideo || existingHasVideo)) {
      callLog("reusing existing local media", {
        callType,
        audioTracks: existingStream.getAudioTracks().length,
        videoTracks: existingStream.getVideoTracks().length,
      });
      existingStream.getTracks().forEach(attachLocalTrackHandlers);
      setLocalStream(new MediaStream(existingStream.getTracks().filter(isLiveTrack)));
      return existingStream;
    }

    if (mediaRequestRef.current && mediaKindRef.current === callType) {
      callLog("waiting for in-flight local media request", { callType });
      return mediaRequestRef.current;
    }

    mediaKindRef.current = callType;
    mediaRequestRef.current = (async () => {
      try {
        callLog("requesting local media", { callType, needsVideo });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: existingHasAudio
            ? false
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
          video:
            needsVideo && !existingHasVideo
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 24, max: 30 },
                }
              : false,
        });
        const mergedStream = new MediaStream([
          ...(existingStream?.getTracks().filter(isLiveTrack) || []),
          ...stream.getTracks(),
        ]);

        mergedStream.getTracks().forEach((track) => {
          attachLocalTrackHandlers(track);
          callLog("local media track acquired", {
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            label: track.label,
          });
        });

        localStreamRef.current = mergedStream;
        cameraTrackRef.current = mergedStream.getVideoTracks().find(isLiveTrack) || null;
        outboundVideoTrackRef.current =
          isScreenSharing && screenRef.current?.getVideoTracks()[0]
            ? screenRef.current.getVideoTracks()[0]
            : cameraTrackRef.current;
        setIsCameraOff(!needsVideo || !cameraTrackRef.current);
        setLocalStream(new MediaStream(mergedStream.getTracks().filter(isLiveTrack)));
        return mergedStream;
      } catch (mediaError) {
        callLog("local media request failed", mediaError);
        setError(
          callType === "video"
            ? "Camera or microphone permission was denied."
            : "Microphone permission was denied."
        );
        throw mediaError;
      } finally {
        mediaRequestRef.current = null;
        mediaKindRef.current = null;
      }
    })();

    return mediaRequestRef.current;
  }, [attachLocalTrackHandlers, isScreenSharing]);

  const createPeer = useCallback(
    ({ callId, targetUserId, stream }) => {
      const normalizedTargetId = String(targetUserId);
      const existingPeer = peersRef.current.get(normalizedTargetId);
      const addLocalTracks = (peer) => {
        stream?.getTracks().filter(isLiveTrack).forEach((track) => {
          const outboundTrack =
            track.kind === "video" ? outboundVideoTrackRef.current || track : track;
          if (peer.getSenders().some((sender) => sender.track?.id === outboundTrack.id)) {
            return;
          }
          callLog("adding local track to peer", {
            targetUserId: normalizedTargetId,
            kind: outboundTrack.kind,
            readyState: outboundTrack.readyState,
            enabled: outboundTrack.enabled,
          });
          peer.addTrack(outboundTrack, stream);
        });
      };

      if (existingPeer && existingPeer.connectionState !== "closed") {
        callLog("reusing existing peer connection", {
          targetUserId: normalizedTargetId,
          signalingState: existingPeer.signalingState,
          connectionState: existingPeer.connectionState,
          iceConnectionState: existingPeer.iceConnectionState,
        });
        addLocalTracks(existingPeer);
        return existingPeer;
      }

      if (existingPeer) {
        callLog("discarding closed peer connection before recreate", {
          targetUserId: normalizedTargetId,
        });
        cleanupPeer(normalizedTargetId);
      }

      callLog("creating peer connection", { callId, targetUserId: normalizedTargetId });
      const peer = new RTCPeerConnection(rtcConfig);
      const nextRemoteStream = new MediaStream();
      updateRemoteStream(normalizedTargetId, nextRemoteStream);
      addLocalTracks(peer);
      peer.ontrack = (event) => {
        callLog("track received", {
          fromUserId: normalizedTargetId,
          kind: event.track?.kind,
          streams: event.streams?.length || 0,
          readyState: event.track?.readyState,
        });
        const incomingTracks = event.streams?.[0]?.getTracks()?.length
          ? event.streams[0].getTracks()
          : [event.track].filter(Boolean);
        incomingTracks.forEach((track) => {
          if (!nextRemoteStream.getTracks().some((item) => item.id === track.id)) {
            nextRemoteStream.addTrack(track);
          }
          const refreshRemoteStream = () => {
            updateRemoteStream(normalizedTargetId, nextRemoteStream);
          };
          track.addEventListener?.("unmute", () => {
            callLog("remote track unmuted", { fromUserId: normalizedTargetId, kind: track.kind });
            refreshRemoteStream();
          });
          track.addEventListener?.("mute", () => {
            callLog("remote track muted", { fromUserId: normalizedTargetId, kind: track.kind });
            refreshRemoteStream();
          });
          track.addEventListener?.("ended", () => {
            callLog("remote track ended", {
              fromUserId: normalizedTargetId,
              kind: track.kind,
              readyState: track.readyState,
            });
            refreshRemoteStream();
            if (track.kind === "video") {
              window.setTimeout(() => {
                const stillMissing = !nextRemoteStream
                  .getVideoTracks()
                  .some((item) => item.readyState === "live" && !item.muted);
                if (stillMissing && peer.connectionState !== "closed") {
                  negotiatePeer(normalizedTargetId, { iceRestart: true });
                }
              }, 800);
            }
          });
        });
        updateRemoteStream(normalizedTargetId, nextRemoteStream);
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          callLog("ICE candidate sent", {
            targetUserId: normalizedTargetId,
            ...getCandidateSummary(event.candidate),
          });
          getChatSocket(token)?.emit("call:ice-candidate", {
            callId,
            targetUserId: normalizedTargetId,
            candidate: event.candidate,
          });
        }
      };
      const logSelectedCandidatePair = async () => {
        try {
          const stats = await peer.getStats();
          let selectedPair = null;
          stats.forEach((report) => {
            if (report.type === "transport" && report.selectedCandidatePairId) {
              selectedPair = stats.get(report.selectedCandidatePairId);
            }
            if (report.type === "candidate-pair" && report.selected) {
              selectedPair = report;
            }
          });

          if (!selectedPair) {
            return;
          }

          const localCandidate = stats.get(selectedPair.localCandidateId);
          const remoteCandidate = stats.get(selectedPair.remoteCandidateId);
          callLog("selected ICE candidate pair", {
            targetUserId: normalizedTargetId,
            local: localCandidate
              ? {
                  candidateType: localCandidate.candidateType,
                  protocol: localCandidate.protocol,
                  address: localCandidate.address || localCandidate.ip,
                  port: localCandidate.port,
                }
              : null,
            remote: remoteCandidate
              ? {
                  candidateType: remoteCandidate.candidateType,
                  protocol: remoteCandidate.protocol,
                  address: remoteCandidate.address || remoteCandidate.ip,
                  port: remoteCandidate.port,
                }
              : null,
          });
        } catch (statsError) {
          callLog("selected ICE candidate pair lookup failed", {
            targetUserId: normalizedTargetId,
            error: statsError?.message || statsError,
          });
        }
      };
      const restartIce = async () => {
        const currentCall = activeCallRef.current;

        if (
          !currentCall?.callId ||
          peer.signalingState !== "stable" ||
          peer.connectionState === "closed" ||
          restartingPeersRef.current.has(normalizedTargetId)
        ) {
          return;
        }

        restartingPeersRef.current.add(normalizedTargetId);
        try {
          await getMedia(currentCall.callType || "audio");
          peer.restartIce?.();
          await negotiatePeer(normalizedTargetId, { iceRestart: true });
        } catch (restartError) {
          callLog("ICE restart failed", {
            targetUserId: normalizedTargetId,
            error: restartError?.message || restartError,
          });
          cleanupPeer(normalizedTargetId);
        } finally {
          window.setTimeout(() => restartingPeersRef.current.delete(normalizedTargetId), 2500);
        }
      };
      peer.onnegotiationneeded = () => {
        callLog("negotiationneeded", {
          targetUserId: normalizedTargetId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
      };
      peer.onsignalingstatechange = () => {
        callLog("signalingState changed", {
          targetUserId: normalizedTargetId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
      };
      peer.oniceconnectionstatechange = () => {
        const state = peer.iceConnectionState;
        callLog("iceConnectionState changed", {
          targetUserId: normalizedTargetId,
          iceConnectionState: state,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
        });
        setPeerStatuses((current) => ({
          ...current,
          [normalizedTargetId]: state,
        }));

        if (["connected", "completed"].includes(state)) {
          logSelectedCandidatePair();
        } else if (["failed", "disconnected"].includes(state)) {
          restartIce();
        }
      };
      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        callLog("connectionState changed", {
          targetUserId: normalizedTargetId,
          connectionState: state,
          iceConnectionState: peer.iceConnectionState,
          signalingState: peer.signalingState,
        });
        setPeerStatuses((current) => ({
          ...current,
          [normalizedTargetId]: state,
        }));

        if (state === "failed") {
          restartIce();
        } else if (state === "disconnected") {
          window.setTimeout(() => {
            if (peer.connectionState === "disconnected") {
              restartIce();
            }
          }, 1200);
        } else if (state === "closed") {
          cleanupPeer(normalizedTargetId);
        }
      };
      setPeerStatuses((current) => ({
        ...current,
        [normalizedTargetId]: "connecting",
      }));
      peersRef.current.set(normalizedTargetId, peer);
      return peer;
    },
    [cleanupPeer, getMedia, negotiatePeer, token, updateRemoteStream]
  );

  const startCall = useCallback(
    async ({ conversation, callType, meetingId = "", notifyMessage = "" }) => {
      if (!conversation) {
        return;
      }

      const isGroup = conversation.type !== "direct";
      const receiver = (conversation.participants || []).find(
        (participant) => getId(participant) !== getId(user)
      );

      if (!isGroup && !receiver) {
        setError("A direct call needs another participant.");
        return;
      }

      setError("");
      setIsCameraOff(callType !== "video");
      await getMedia(callType);
      getChatSocket(token)?.emit(
        "call:start",
        {
          conversationId: getId(conversation),
          receiverId: isGroup ? undefined : getId(receiver),
          callType,
          meetingId: String(meetingId || ""),
          notifyMessage: String(notifyMessage || ""),
        },
        (response) => {
          if (!response?.ok) {
            stopStreams();
            setError(response?.error || "Unable to start call.");
          }
        }
      );
    },
    [getMedia, stopStreams, token, user]
  );

  const joinCall = useCallback(
    async (call) => {
      if (!call?.callId) {
        return;
      }

      setError("");
      setIsCameraOff((call.callType || "audio") !== "video");
      await getMedia(call.callType || "audio");
      setActiveCall({
        ...call,
        scope: "group",
        status: "lobby",
      });
      getChatSocket(token)?.emit("call:join", { callId: call.callId });
    },
    [getMedia, token]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) {
      return;
    }

    setError("");
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    setIsCameraOff(incomingCall.callType !== "video");
    await getMedia(incomingCall.callType);
    const nextCall = {
      ...incomingCall,
      status: incomingCall.scope === "group" ? "lobby" : "connecting",
      peer: incomingCall.caller,
    };
    activeCallRef.current = nextCall;
    setActiveCall(nextCall);
    setIncomingCall(null);

    if (incomingCall.scope === "group") {
      getChatSocket(token)?.emit("call:join", { callId: incomingCall.callId });
      return;
    }

    createPeer({
      callId: incomingCall.callId,
      targetUserId: getId(incomingCall.caller),
      stream: localStreamRef.current,
    });
    getChatSocket(token)?.emit("call:accept", { callId: incomingCall.callId });
  }, [createPeer, getMedia, incomingCall, token]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) {
      return;
    }

    getChatSocket(token)?.emit("call:reject", { callId: incomingCall.callId });
    closeCallUi();
  }, [closeCallUi, incomingCall, token]);

  const leaveCall = useCallback(() => {
    const call = activeCallRef.current;

    if (!call) {
      return;
    }

    getChatSocket(token)?.emit(
      call.scope === "group" ? "call:leave" : "call:end",
      { callId: call.callId }
    );
    closeCallUi();
  }, [closeCallUi, token]);

  const endCall = useCallback(() => {
    const callId = activeCallRef.current?.callId || incomingCall?.callId;
    if (callId) {
      getChatSocket(token)?.emit("call:end", { callId });
    }
    closeCallUi();
  }, [closeCallUi, incomingCall, token]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    const nextOff = !isCameraOff;
    let cameraTrack = cameraTrackRef.current || localStreamRef.current?.getVideoTracks()[0] || null;

    if (nextOff) {
      if (cameraTrack) {
        cameraTrack.stop();
        localStreamRef.current?.removeTrack?.(cameraTrack);
      }
      cameraTrackRef.current = null;
      if (!isScreenSharing) {
        outboundVideoTrackRef.current = null;
        await syncPeerVideoTrack(null, null);
      }
      setLocalStream(new MediaStream(localStreamRef.current?.getTracks().filter(isLiveTrack) || []));
      setIsCameraOff(true);
      return;
    }

    if (!cameraTrack || !isLiveTrack(cameraTrack) || cameraTrack.muted) {
      if (cameraTrack) {
        cameraTrack.stop();
        localStreamRef.current?.removeTrack?.(cameraTrack);
      }
      await getMedia("video");
      cameraTrack = cameraTrackRef.current || localStreamRef.current?.getVideoTracks()[0] || null;
    }

    if (cameraTrack) {
      cameraTrack.enabled = true;
      if (!isScreenSharing) {
        outboundVideoTrackRef.current = cameraTrack;
        await syncPeerVideoTrack(cameraTrack, localStreamRef.current);
      }
      setLocalStream(new MediaStream(localStreamRef.current?.getTracks().filter(isLiveTrack) || []));
    }
    setIsCameraOff(nextOff);
  }, [getMedia, isCameraOff, isScreenSharing, syncPeerVideoTrack]);

  const stopScreenShare = useCallback(() => {
    const call = activeCallRef.current;
    const cameraTrack = cameraTrackRef.current || localStreamRef.current?.getVideoTracks()[0];

    screenRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenRef.current = null;
    setIsScreenSharing(false);

    if (cameraTrack) {
      cameraTrack.enabled = true;
      outboundVideoTrackRef.current = cameraTrack;
      void syncPeerVideoTrack(cameraTrack, localStreamRef.current);
      setLocalStream(
        new MediaStream(localStreamRef.current?.getTracks().filter(isLiveTrack) || [])
      );
    } else {
      void syncPeerVideoTrack(null, null);
    }

    if (call?.callId) {
      getChatSocket(token)?.emit("call:screen-share-stopped", { callId: call.callId });
    }
    callLog("screen share stopped");
  }, [syncPeerVideoTrack, token]);

  const shareScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return;
    }

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          frameRate: { ideal: 15, max: 24 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        return;
      }

      screenRef.current = displayStream;
      outboundVideoTrackRef.current = screenTrack;
      setIsScreenSharing(true);
      callLog("screen share started", {
        label: screenTrack.label,
        readyState: screenTrack.readyState,
      });

      await syncPeerVideoTrack(screenTrack, localStreamRef.current || displayStream);
      setLocalStream(
        new MediaStream([
          ...(localStreamRef.current?.getAudioTracks().filter(isLiveTrack) || []),
          screenTrack,
        ])
      );

      const call = activeCallRef.current;
      if (call?.callId) {
        getChatSocket(token)?.emit("call:screen-share-started", { callId: call.callId });
      }

      screenTrack.onended = stopScreenShare;
    } catch (screenError) {
      callLog("screen share failed", screenError);
      setError("Screen sharing could not be started.");
    }
  }, [isScreenSharing, stopScreenShare, syncPeerVideoTrack, token]);

  const toggleRaiseHand = useCallback(() => {
    const call = activeCallRef.current;
    const userId = getId(user);
    const raised = !raisedHands[userId];
    setRaisedHands((current) => ({
      ...current,
      [userId]: raised,
    }));
    if (call?.callId) {
      getChatSocket(token)?.emit("call:raise-hand", {
        callId: call.callId,
        raised,
      });
    }
  }, [raisedHands, token, user]);

  const enterFullscreen = useCallback(() => {
    (callFrameRef.current || stageRef.current)?.requestFullscreen?.();
  }, []);

  const minimizeCall = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const restoreCall = useCallback(() => {
    setIsMinimized(false);
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = getChatSocket(token);
    if (!socket) {
      return undefined;
    }

    const handleIncomingCall = (call) => {
      setIsCameraOff((call.callType || "audio") !== "video");
      setIncomingCall(call);
      if (call.scope !== "group") {
        createPeer({
          callId: call.callId,
          targetUserId: getId(call.caller),
        });
      }
      stopRingtoneRef.current?.();
      stopRingtoneRef.current = playRingtone();
      notifyIncomingCall(call);
    };
    const handleOutgoingCall = (call) => {
      setIsCameraOff((call.callType || "audio") !== "video");
      setActiveCall({
        ...call,
        status: call.scope === "group" ? "connected" : "ringing",
        peer: call.receiver,
        startedAt: call.startTime || (call.scope === "group" ? new Date().toISOString() : null),
      });
      if (call.scope !== "group") {
        createPeer({
          callId: call.callId,
          targetUserId: getId(call.receiver),
        });
      }
      if (call.scope === "group") {
        setChannelCalls((current) => ({
          ...current,
          [call.conversationId]: call,
        }));
      }
    };
    const handleChannelActive = ({ call }) => {
      setChannelCalls((current) => ({
        ...current,
        [call.conversationId]: call,
      }));
    };
    const handlePresence = (payload = {}) => {
      setCallPresence(payload.presence || {});
    };
    const handleParticipants = (payload = {}) => {
      if (payload.call?.conversationId) {
        setChannelCalls((current) => ({
          ...current,
          [payload.call.conversationId]: payload.call,
        }));
      }
      if (payload.call?.callId === activeCallRef.current?.callId) {
        const nextParticipants = payload.participants || [];
        const joinedIds = new Set(
          nextParticipants
            .filter((participant) => participant.status === "Joined")
            .map((participant) => getId(participant.user))
        );

        peersRef.current.forEach((_peer, userId) => {
          if (!joinedIds.has(userId)) {
            cleanupPeer(userId);
          }
        });
        setParticipants(nextParticipants);
      }
    };
    const handleAccepted = async (payload) => {
      const currentCall = activeCallRef.current;
      if (
        !currentCall ||
        currentCall.callId !== payload.callId ||
        String(payload.callerId) !== getId(user)
      ) {
        return;
      }

      const stream = localStreamRef.current || (await getMedia(currentCall.callType));
      const targetUserId = getId(currentCall.peer);
      createPeer({ callId: payload.callId, targetUserId, stream });
      await negotiatePeer(targetUserId);
      setIsCameraOff((currentCall.callType || "audio") !== "video");
      setActiveCall({ ...currentCall, status: "connected", startedAt: payload.startTime });
    };
    const handleJoined = (payload) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== payload.call?.callId) {
        return;
      }

      setActiveCall({
        ...currentCall,
        ...payload.call,
        status: "connected",
        startedAt: payload.call.startTime || currentCall.startedAt,
      });
      window.setTimeout(async () => {
        const stream = localStreamRef.current || (await getMedia(currentCall.callType));
        for (const participantId of (payload.existingParticipantIds || [])
          .map(String)
          .filter((participantId) => participantId && participantId !== getId(user))) {
          if (!peersRef.current.has(participantId)) {
            createPeer({
              callId: payload.call.callId,
              targetUserId: participantId,
              stream,
            });
            await negotiatePeer(participantId);
          }
        }
      }, 300);
    };
    const handleParticipantJoined = async (payload) => {
      const currentCall = activeCallRef.current;
      const joinedUserId = getId(payload.user);

      if (
        !currentCall ||
        currentCall.callId !== payload.call?.callId ||
        joinedUserId === getId(user)
      ) {
        return;
      }

      const stream = localStreamRef.current || (await getMedia(currentCall.callType));
      createPeer({
        callId: currentCall.callId,
        targetUserId: joinedUserId,
        stream,
      });
    };
    const handleParticipantLeft = (payload) => {
      cleanupPeer(String(payload.userId || ""));
    };
    const handleOffer = async (payload) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== payload.callId || payload.description?.type !== "offer") {
        return;
      }

      const fromUserId = String(payload.fromUserId);
      const descriptionKey = getDescriptionKey(payload.description);
      const processedOfferSet = processedOffersRef.current.get(fromUserId) || new Set();

      if (processedOfferSet.has(descriptionKey)) {
        callLog("skipping duplicate offer", {
          fromUserId,
          signalingState: peersRef.current.get(fromUserId)?.signalingState,
          connectionState: peersRef.current.get(fromUserId)?.connectionState,
          iceConnectionState: peersRef.current.get(fromUserId)?.iceConnectionState,
        });
        return;
      }
      processedOfferSet.add(descriptionKey);
      processedOffersRef.current.set(fromUserId, processedOfferSet);

      const stream = localStreamRef.current || (await getMedia(currentCall.callType));
      const peer = createPeer({
        callId: payload.callId,
        targetUserId: fromUserId,
        stream,
      });
      const isPolite = getId(user).localeCompare(fromUserId) < 0;
      const offerCollision =
        makingOfferRef.current.get(fromUserId) || peer.signalingState !== "stable";

      ignoredOfferRef.current.set(fromUserId, !isPolite && offerCollision);
      if (ignoredOfferRef.current.get(fromUserId)) {
        callLog("ignoring offer collision from impolite peer", {
          fromUserId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
        return;
      }

      if (offerCollision) {
        callLog("rolling back local description before applying offer", {
          fromUserId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
        await peer.setLocalDescription({ type: "rollback" }).catch((rollbackError) => {
          callLog("rollback before offer failed", {
            fromUserId,
            error: rollbackError?.message || rollbackError,
          });
        });
      }
      callLog("setRemoteDescription(offer) starting", {
        fromUserId,
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceRestart: Boolean(payload.iceRestart),
      });
      await peer.setRemoteDescription(payload.description);
      callLog("remote description set", {
        fromUserId,
        type: payload.description?.type,
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceRestart: Boolean(payload.iceRestart),
      });
      await applyQueuedCandidates(fromUserId, peer);
      if (peer.signalingState !== "have-remote-offer") {
        callLog("skipping answer because offer was not applied", {
          fromUserId,
          signalingState: peer.signalingState,
        });
        return;
      }
      const answer = await peer.createAnswer();
      callLog("answer created", {
        targetUserId: fromUserId,
        signalingState: peer.signalingState,
      });
      await peer.setLocalDescription(answer);
      callLog("local answer set", {
        targetUserId: fromUserId,
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
      });
      socket.emit("call:answer", {
        callId: payload.callId,
        targetUserId: fromUserId,
        description: peer.localDescription || answer,
      });
      setActiveCall({ ...currentCall, status: "connected", startedAt: payload.startTime });
    };
    const handleAnswer = async (payload) => {
      if (payload.description?.type !== "answer") {
        return;
      }

      const fromUserId = String(payload.fromUserId);
      const peer = peersRef.current.get(fromUserId);

      if (!peer || activeCallRef.current?.callId !== payload.callId) {
        return;
      }

      const descriptionKey = getDescriptionKey(payload.description);
      const processedAnswerSet = processedAnswersRef.current.get(fromUserId) || new Set();

      if (processedAnswerSet.has(descriptionKey)) {
        callLog("skipping duplicate answer", {
          fromUserId,
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
        });
        return;
      }

      if (peer.signalingState !== "have-local-offer") {
        callLog("skipping answer in wrong signaling state", {
          fromUserId,
          expected: "have-local-offer",
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
          descriptionType: payload.description?.type,
        });
        return;
      }
      processedAnswerSet.add(descriptionKey);
      processedAnswersRef.current.set(fromUserId, processedAnswerSet);

      callLog("setRemoteDescription(answer) starting", {
        fromUserId,
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
      });
      await peer.setRemoteDescription(payload.description);
      callLog("remote description set", {
        fromUserId,
        type: payload.description?.type,
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
      });
      await applyQueuedCandidates(fromUserId, peer);
    };
    const handleCandidate = async (payload) => {
      if (!payload.candidate || activeCallRef.current?.callId !== payload.callId) {
        return;
      }

      const fromUserId = String(payload.fromUserId);
      if (ignoredOfferRef.current.get(fromUserId)) {
        callLog("skipping ICE candidate for ignored offer", { fromUserId });
        return;
      }
      const candidate = new RTCIceCandidate(payload.candidate);
      const candidateKey = getCandidateKey(payload.candidate);
      const processedSet = processedCandidatesRef.current.get(fromUserId) || new Set();
      const peer = peersRef.current.get(fromUserId);

      if (processedSet.has(candidateKey)) {
        callLog("skipping duplicate ICE candidate", {
          fromUserId,
          candidateKey,
        });
        return;
      }

      callLog("ICE candidate received", {
        fromUserId,
        ...getCandidateSummary(payload.candidate),
        signalingState: peer?.signalingState,
        connectionState: peer?.connectionState,
        iceConnectionState: peer?.iceConnectionState,
      });
      if (peer?.remoteDescription) {
        try {
          await peer.addIceCandidate(candidate);
          processedSet.add(candidateKey);
          processedCandidatesRef.current.set(fromUserId, processedSet);
          callLog("ICE candidate applied", {
            fromUserId,
            ...getCandidateSummary(payload.candidate),
          });
        } catch (candidateError) {
          callLog("ICE candidate apply failed", {
            fromUserId,
            error: candidateError?.message || candidateError,
          });
        }
      } else {
        const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];

        if (pendingCandidates.some((item) => getCandidateKey(item) === candidateKey)) {
          callLog("skipping duplicate pending ICE candidate", {
            fromUserId,
            candidateKey,
          });
          return;
        }

        callLog("queueing ICE candidate until remoteDescription is set", {
          fromUserId,
          ...getCandidateSummary(payload.candidate),
          queuedCount: pendingCandidates.length + 1,
        });
        pendingCandidatesRef.current.set(fromUserId, [
          ...pendingCandidates,
          candidate,
        ]);
      }
    };
    const handleRaiseHand = (payload) => {
      setRaisedHands((current) => ({
        ...current,
        [String(payload.userId)]: Boolean(payload.raised),
      }));
    };
    const handleScreenShareStarted = (payload = {}) => {
      setScreenSharers((current) => ({
        ...current,
        [String(payload.userId)]: true,
      }));
    };
    const handleScreenShareStopped = (payload = {}) => {
      setScreenSharers((current) => {
        const next = { ...current };
        delete next[String(payload.userId)];
        return next;
      });
    };
    const handleEnded = (payload = {}) => {
      if (payload.conversationId) {
        setChannelCalls((current) => {
          const next = { ...current };
          delete next[payload.conversationId];
          return next;
        });
      }
      closeCallUi();
    };
    const handleMissed = (payload) => {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Missed call", {
          body: `${payload.callType === "video" ? "Video" : "Audio"} call was not answered`,
        });
      }
      closeCallUi();
    };
    const handleSocketReconnect = async () => {
      const currentCall = activeCallRef.current;

      if (!currentCall?.callId) {
        return;
      }

      callLog("socket reconnected during call", {
        callId: currentCall.callId,
        scope: currentCall.scope,
        peerCount: peersRef.current.size,
      });

      if (currentCall.scope === "group") {
        socket.emit("call:join", { callId: currentCall.callId });
      }

      const stream = await getMedia(currentCall.callType || "audio").catch(() => null);
      peersRef.current.forEach((peer, targetUserId) => {
        stream?.getTracks().filter(isLiveTrack).forEach((track) => {
          const sender = peer.getSenders().find((item) => item.track?.kind === track.kind);
          const outboundTrack =
            track.kind === "video" ? outboundVideoTrackRef.current || track : track;
          if (sender && sender.track?.id !== outboundTrack.id) {
            sender.replaceTrack(outboundTrack).catch((replaceError) => {
              callLog("reconnect replaceTrack failed", {
                targetUserId,
                kind: outboundTrack.kind,
                error: replaceError?.message || replaceError,
              });
            });
          } else if (!sender) {
            peer.addTrack(outboundTrack, stream);
            negotiatePeer(targetUserId);
          }
        });
        if (
          ["disconnected", "failed"].includes(peer.connectionState) ||
          ["disconnected", "failed"].includes(peer.iceConnectionState)
        ) {
          negotiatePeer(targetUserId, { iceRestart: true });
        }
      });
    };

    socket.on("connect", handleSocketReconnect);
    socket.on("call:incoming", handleIncomingCall);
    socket.on("call:outgoing", handleOutgoingCall);
    socket.on("call:channel-active", handleChannelActive);
    socket.on("call:presence", handlePresence);
    socket.on("call:participants", handleParticipants);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:joined", handleJoined);
    socket.on("call:participant-joined", handleParticipantJoined);
    socket.on("call:participant-left", handleParticipantLeft);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleCandidate);
    socket.on("call:raise-hand", handleRaiseHand);
    socket.on("call:screen-share-started", handleScreenShareStarted);
    socket.on("call:screen-share-stopped", handleScreenShareStopped);
    socket.on("call:ended", handleEnded);
    socket.on("call:rejected", handleEnded);
    socket.on("call:missed", handleMissed);
    socket.on("call:left", handleEnded);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
      socket.off("call:outgoing", handleOutgoingCall);
      socket.off("call:channel-active", handleChannelActive);
      socket.off("call:presence", handlePresence);
      socket.off("call:participants", handleParticipants);
      socket.off("call:accepted", handleAccepted);
      socket.off("call:joined", handleJoined);
      socket.off("call:participant-joined", handleParticipantJoined);
      socket.off("call:participant-left", handleParticipantLeft);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleCandidate);
      socket.off("call:raise-hand", handleRaiseHand);
      socket.off("call:screen-share-started", handleScreenShareStarted);
      socket.off("call:screen-share-stopped", handleScreenShareStopped);
      socket.off("call:ended", handleEnded);
      socket.off("call:rejected", handleEnded);
      socket.off("call:missed", handleMissed);
      socket.off("call:left", handleEnded);
      socket.off("connect", handleSocketReconnect);
    };
  }, [
    applyQueuedCandidates,
    cleanupPeer,
    closeCallUi,
    createPeer,
    getMedia,
    negotiatePeer,
    notifyIncomingCall,
    token,
    user,
  ]);

  useEffect(() => {
    if (!activeCall?.startedAt && activeCall?.status !== "connected") {
      return undefined;
    }

    const startedAt = activeCall.startedAt ? new Date(activeCall.startedAt).getTime() : Date.now();
    const intervalId = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeCall?.startedAt, activeCall?.status]);

  useEffect(() => {
    peersRef.current.forEach((peer) => {
      const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
      if (sender?.track) {
        sender.track.enabled = !isMuted;
      }
    });
  }, [isMuted]);

  const value = useMemo(
    () => ({
      activeCall,
      callPresence,
      channelCalls,
      error,
      startCall,
      joinCall,
    }),
    [activeCall, callPresence, channelCalls, error, joinCall, startCall]
  );

  const participantById = useMemo(
    () =>
      new Map(
        participants.map((participant) => [
          getId(participant.user),
          participant,
        ])
      ),
    [participants]
  );
  const remoteEntries = Object.entries(remoteStreams);
  const isGroupCall = activeCall?.scope === "group";
  const hasLocalVideo =
    Boolean(localStream && hasLiveTrack(localStream, "video")) && !isCameraOff;
  const canEndForEveryone =
    activeCall &&
    (!isGroupCall ||
      getId(activeCall.createdBy || activeCall.callerId) === getId(user) ||
      ["Admin", "Manager"].includes(user?.role));
  const joinedParticipantCount =
    participants.filter((item) => item.status === "Joined").length ||
    (remoteEntries.length + (activeCall ? 1 : 0));
  const stageTileCount = Math.max(1, remoteEntries.length || 1);
  const stageGridClass =
    stageTileCount === 1
      ? "grid-cols-1"
      : stageTileCount === 2
        ? "grid-cols-1 md:grid-cols-2"
        : stageTileCount <= 4
          ? "grid-cols-1 sm:grid-cols-2"
          : stageTileCount <= 9
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const featuredRemoteEntry = isGroupCall
    ? remoteEntries.find(([userId]) => screenSharers[userId]) || null
    : null;
  const isLocalFeaturedShare = isGroupCall && isScreenSharing && !featuredRemoteEntry;
  const hasFeaturedShareLayout = Boolean(featuredRemoteEntry || isLocalFeaturedShare);
  const sidebarRemoteEntries = featuredRemoteEntry
    ? remoteEntries.filter(([userId]) => userId !== featuredRemoteEntry[0])
    : remoteEntries;
  const hasRemoteParticipants = remoteEntries.length > 0;
  const headerStatusLabel = getCallStatusLabel(activeCall, duration);
  const callTitle = isGroupCall
    ? activeCall?.channelName || "Group call"
    : activeCall?.peer?.name || "Call";
  const waitingTitle = isGroupCall
    ? "Waiting for participants to join"
    : `Waiting for ${activeCall?.peer?.name || "participant"} to join`;
  const waitingSubtitle =
    activeCall?.status === "ringing"
      ? "Ringing now. You can continue chatting while waiting."
      : "Connecting meeting room and preparing media.";
  const getConnectionLabel = (userId) => {
    const status = peerStatuses[userId];
    if (["connected", "completed"].includes(status)) {
      return "Good";
    }
    if (["failed", "disconnected"].includes(status)) {
      return "Reconnecting";
    }
    return "Connecting";
  };
  const renderRemoteTile = (userId, remoteMedia, { compact = false, featured = false } = {}) => {
    const stream = remoteMedia?.stream || remoteMedia;
    const participant = participantById.get(userId);
    const userName =
      participant?.user?.name ||
      (!isGroupCall ? activeCall.peer?.name : "") ||
      "Participant";

    return (
      <div
        key={`${userId}-${featured ? "featured" : compact ? "compact" : "stage"}`}
        className={cn(
          "relative overflow-hidden rounded-lg border bg-slate-800 shadow-lg",
          featured ? "min-h-full" : compact ? "min-h-[150px]" : "min-h-[210px]",
          stageTileCount === 1 && !compact && !featured && "min-h-full",
          raisedHands[userId] || ["connected", "completed"].includes(peerStatuses[userId])
            ? "border-emerald-300/70"
            : "border-white/10"
        )}
      >
        <RemoteMedia
          key={userId}
          stream={stream}
          muted={isSpeakerOff}
          onVideoStalled={() => negotiatePeer(userId, { iceRestart: true })}
          user={participant?.user || (!isGroupCall ? activeCall.peer : null)}
          name={userName}
        />
        <div
          className={cn(
            "absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 font-bold",
            compact ? "max-w-[82%] text-[11px]" : "max-w-[75%] text-xs"
          )}
        >
          <span className="truncate">{userName}</span>
          {screenSharers[userId] ? <MonitorUp className="h-3.5 w-3.5" /> : null}
        </div>
        <span
          className={cn(
            "absolute rounded-full bg-black/55 px-2 py-1 font-black uppercase",
            screenSharers[userId] ? "bg-emerald-400 text-slate-950" : "text-white/70",
            compact ? "right-2 top-2 text-[9px]" : "right-3 top-3 text-[10px]"
          )}
        >
          {screenSharers[userId] ? "Sharing" : getConnectionLabel(userId)}
        </span>
        {raisedHands[userId] ? (
          <span
            className={cn(
              "absolute rounded-full bg-amber-400 px-2 py-1 font-black text-slate-950",
              compact ? "right-2 top-9 text-[10px]" : "right-3 top-11 text-xs"
            )}
          >
            Hand
          </span>
        ) : null}
      </div>
    );
  };
  const renderCallControls = (className = "") => (
    <div
      className={cn(
        "pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/12 bg-slate-950/78 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur-xl",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white", isMuted && "bg-rose-500")}
        onClick={toggleMute}
        title="Mute microphone"
        aria-label="Mute microphone"
      >
        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white", isCameraOff && "bg-rose-500")}
        onClick={toggleCamera}
        title="Toggle camera"
        aria-label="Toggle camera"
      >
        {isCameraOff ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white", isScreenSharing && "bg-emerald-500 text-white")}
        onClick={shareScreen}
        title="Share screen"
        aria-label="Share screen"
      >
        <MonitorUp className="h-5 w-5" />
      </Button>
      {isGroupCall ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white", raisedHands[getId(user)] && "bg-amber-400 text-slate-950")}
          onClick={toggleRaiseHand}
          title="Raise hand"
          aria-label="Raise hand"
        >
          <Hand className="h-5 w-5" />
        </Button>
      ) : null}
      {isGroupCall ? (
        <Button
          type="button"
          variant="secondary"
          className="rounded-full border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          onClick={leaveCall}
        >
          Leave
        </Button>
      ) : null}
      {canEndForEveryone ? (
        <Button
          type="button"
          variant="destructive"
          size={isGroupCall ? "default" : "icon"}
          className={cn("rounded-full", !isGroupCall && "h-12 w-12")}
          onClick={endCall}
          title="End call"
          aria-label="End call"
        >
          <PhoneOff className="h-5 w-5" />
          {isGroupCall ? "End for all" : null}
        </Button>
      ) : null}
    </div>
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {incomingCall ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 text-center shadow-2xl">
            <UserAvatar
              user={incomingCall.caller}
              name={incomingCall.caller?.name || incomingCall.channelName}
              className="mx-auto h-20 w-20 rounded-[28px] border border-blue-100"
              fallbackClassName="text-xl"
            />
            <h2 className="mt-4 text-xl font-extrabold text-slate-950">
              {incomingCall.scope === "group"
                ? incomingCall.channelName || "Group call"
                : incomingCall.caller?.name || "Incoming call"}
            </h2>
            <p className="mt-1 text-sm font-semibold capitalize text-slate-500">
              Incoming {incomingCall.scope === "group" ? "group " : ""}
              {incomingCall.callType} call
            </p>
            {incomingCall.scope === "group" ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {(incomingCall.participants || []).length} invited
              </p>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button type="button" variant="destructive" onClick={rejectCall}>
                <PhoneOff className="h-4 w-4" />
                Decline
              </Button>
              <Button type="button" onClick={acceptCall}>
                <Phone className="h-4 w-4" />
                {incomingCall.scope === "group" ? "Join" : "Accept"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {activeCall && !isMinimized ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/88 p-3 text-white backdrop-blur-sm">
          <div
            ref={callFrameRef}
            className="relative flex h-full max-h-[820px] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/12 bg-slate-950 shadow-2xl [&:fullscreen]:max-h-none [&:fullscreen]:max-w-none [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold sm:text-lg">{callTitle}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:text-xs">
                  <span>{headerStatusLabel}</span>
                  <span className="h-1 w-1 rounded-full bg-white/25" />
                  <span>
                    {joinedParticipantCount} participant{joinedParticipantCount === 1 ? "" : "s"}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-emerald-300/60" />
                  <span>{hasRemoteParticipants ? "Network stable" : "Waiting for media"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={minimizeCall}
                  title="Minimize call"
                  aria-label="Minimize call"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={enterFullscreen}
                  title="Full screen"
                  aria-label="Full screen"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div ref={stageRef} className="call-stage relative min-h-0 flex-1 overflow-hidden bg-slate-900">
              {isGroupCall && hasFeaturedShareLayout ? (
                <div className="absolute inset-0 z-10 flex min-h-0 flex-col gap-3 bg-slate-900 p-2 sm:p-3 lg:flex-row">
                  <div className="min-h-[280px] flex-1">
                    {isLocalFeaturedShare ? (
                      <div className="relative min-h-full overflow-hidden rounded-lg border border-emerald-300/70 bg-slate-800 shadow-lg">
                        <LocalVideo stream={localStream} user={user} showVideo={hasLocalVideo} />
                        <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full bg-black/60 px-3 py-1 text-xs font-bold">
                          You {isMuted ? "· muted" : ""}
                        </span>
                        <span className="absolute right-3 top-3 rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-black uppercase text-slate-950">
                          Sharing
                        </span>
                      </div>
                    ) : (
                      renderRemoteTile(featuredRemoteEntry[0], featuredRemoteEntry[1], {
                        featured: true,
                      })
                    )}
                  </div>
                  <div className="grid w-full shrink-0 grid-cols-1 gap-3 lg:w-80">
                    {!isLocalFeaturedShare ? (
                      <div className="relative min-h-[150px] overflow-hidden rounded-lg border border-white/10 bg-slate-800 shadow-lg">
                        <LocalVideo stream={localStream} user={user} showVideo={hasLocalVideo} compact />
                        <span className="absolute bottom-3 left-3 max-w-[82%] truncate rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold">
                          You {isMuted ? "· muted" : ""}
                        </span>
                        {isScreenSharing ? (
                          <span className="absolute right-2 top-2 rounded-full bg-emerald-400 px-2 py-1 text-[9px] font-black uppercase text-slate-950">
                            Sharing
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {sidebarRemoteEntries.map(([userId, remoteMedia]) =>
                      renderRemoteTile(userId, remoteMedia, { compact: true })
                    )}
                  </div>
                </div>
              ) : null}

              <div
                className={cn(
                  "relative h-full min-h-0 overflow-y-auto p-3 sm:p-5",
                  hasRemoteParticipants && "grid gap-3 sm:gap-4",
                  hasRemoteParticipants ? stageGridClass : "flex items-center justify-center",
                  isGroupCall && hasFeaturedShareLayout && "invisible pointer-events-none"
                )}
              >
                {hasRemoteParticipants ? (
                  remoteEntries.map(([userId, remoteMedia]) => {
                    const stream = remoteMedia?.stream || remoteMedia;
                    const participant = participantById.get(userId);
                    const userName =
                      participant?.user?.name ||
                      (!isGroupCall ? activeCall.peer?.name : "") ||
                      "Participant";

                    return (
                      <div
                        key={userId}
                        className={cn(
                          "relative min-h-[210px] overflow-hidden rounded-[22px] border bg-slate-800 shadow-lg transition-all duration-300",
                          stageTileCount === 1 && "min-h-full",
                          raisedHands[userId] ||
                            ["connected", "completed"].includes(peerStatuses[userId])
                            ? "border-emerald-300/70"
                            : "border-white/10"
                        )}
                      >
                        <RemoteMedia
                          key={userId}
                          stream={stream}
                          muted={isSpeakerOff}
                          onVideoStalled={() => negotiatePeer(userId, { iceRestart: true })}
                          user={participant?.user || (!isGroupCall ? activeCall.peer : null)}
                          name={userName}
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-transparent px-4 pb-4 pt-10">
                          <div className="flex max-w-[70%] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold">
                            <span className="truncate">{userName}</span>
                            {screenSharers[userId] ? <MonitorUp className="h-3.5 w-3.5" /> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-black uppercase text-white/70">
                              {getConnectionLabel(userId)}
                            </span>
                            {raisedHands[userId] ? (
                              <span className="rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black uppercase text-slate-950">
                                Hand
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-10 text-center shadow-[0_24px_70px_rgba(15,23,42,0.45)]">
                    <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/10 bg-white/5">
                      <UserAvatar
                        user={activeCall.peer || null}
                        name={activeCall.peer?.name || activeCall.channelName || "Meeting"}
                        className="h-16 w-16 rounded-[18px] border border-white/15"
                        fallbackClassName="text-2xl"
                      />
                    </div>
                    <h3 className="text-2xl font-extrabold text-white">{waitingTitle}</h3>
                    <p className="mt-3 rounded-full bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-amber-200">
                      {activeCall.status === "ringing" ? "Ringing" : "Connecting"}
                    </p>
                    <p className="mt-4 max-w-lg text-sm font-medium leading-6 text-white/65">
                      {waitingSubtitle}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-white/55">
                      <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                        {joinedParticipantCount} participant{joinedParticipantCount === 1 ? "" : "s"} in room
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                        {isGroupCall ? "Host controls start time" : "Auto-connect when they join"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-8 rounded-full px-6"
                      onClick={isGroupCall ? leaveCall : endCall}
                    >
                      <PhoneOff className="h-4 w-4" />
                      {isGroupCall ? "Leave Meeting" : "Cancel Call"}
                    </Button>
                  </div>
                )}

                <div className="pointer-events-none absolute bottom-24 right-3 z-20 sm:bottom-28 sm:right-5">
                  <div className="pointer-events-auto relative h-28 w-40 overflow-hidden rounded-2xl border border-white/15 bg-slate-800 shadow-2xl sm:h-36 sm:w-56">
                    <LocalVideo stream={localStream} user={user} showVideo={hasLocalVideo} compact />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent px-3 pb-3 pt-8">
                      <span className="truncate rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold">
                        You {isMuted ? "· muted" : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        {isScreenSharing ? (
                          <span className="rounded-full bg-emerald-400 px-2 py-1 text-[9px] font-black uppercase text-slate-950">
                            Share
                          </span>
                        ) : null}
                        {isCameraOff ? <CameraOff className="h-3.5 w-3.5 text-white/70" /> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="call-stage-fullscreen-controls pointer-events-none absolute inset-x-0 bottom-5 z-40 justify-center px-4">
                {renderCallControls()}
              </div>

              {false && isGroupCall ? (
                <aside className="hidden border-l border-white/10 bg-slate-950/70 p-4 lg:block">
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    <UsersRound className="h-4 w-4" />
                    Participants
                  </div>
                  <div className="mt-4 space-y-2">
                    {participants.map((participant) => {
                      const participantId = getId(participant.user);
                      return (
                        <div
                          key={participantId}
                          className="flex items-center justify-between rounded-2xl bg-white/7 px-3 py-2"
                        >
                          <span className="truncate text-sm font-semibold">
                            {participant.user?.name || "Member"}
                          </span>
                          <span className="text-[11px] font-bold uppercase text-white/45">
                            {raisedHands[participantId] ? "Raised" : participant.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              ) : null}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
              {renderCallControls()}
            </div>
          </div>
        </div>
      ) : null}
      {activeCall && isMinimized
        ? remoteEntries.map(([userId, remoteMedia]) => (
            <RemoteAudioSink
              key={`minimized-audio-${userId}`}
              stream={remoteMedia?.stream || remoteMedia}
              muted={isSpeakerOff}
            />
          ))
        : null}
      {activeCall && isMinimized ? (
        <div className="fixed bottom-5 right-5 z-[78] w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl border border-white/15 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">
                {isGroupCall
                  ? activeCall.channelName || "Group call"
                  : activeCall.peer?.name || "Call"}
              </p>
              <p className="mt-1 text-xs font-semibold text-white/55">
                {activeCall.status === "ringing" ? "Ringing..." : formatDuration(duration)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={restoreCall}
              title="Restore call"
              aria-label="Restore call"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {isGroupCall ? (
              <Button type="button" variant="secondary" size="sm" onClick={leaveCall}>
                Leave
              </Button>
            ) : null}
            {canEndForEveryone ? (
              <Button type="button" variant="destructive" size="sm" onClick={endCall}>
                <PhoneOff className="h-4 w-4" />
                End
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 shadow-xl">
          {error}
        </div>
      ) : null}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);

  if (!context) {
    throw new Error("useCall must be used within CallProvider");
  }

  return context;
};

