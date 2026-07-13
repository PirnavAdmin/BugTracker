import { motion, useReducedMotion } from "framer-motion";

const CLOUD_PATH =
  "M25 55C11 55 2 47 2 36c0-11 9-19 21-19 4 0 8 1 11 3C40 8 51 1 65 1c18 0 31 10 35 25 4-3 10-5 16-5 13 0 23 8 25 19 10 1 17 7 17 15H25Z";

const GreetingBeachScene = ({ timeOfDay = "afternoon" }) => {
  const reduceMotion = useReducedMotion();
  const isMorning = timeOfDay === "morning";
  const isEvening = timeOfDay === "evening";
  const skyTop = isMorning ? "#fef3c7" : isEvening ? "#7c3aed" : "#bfdbfe";
  const skyBottom = isMorning ? "#fda4af" : isEvening ? "#fb7185" : "#ecfeff";
  const oceanTop = isEvening ? "#4338ca" : "#38bdf8";
  const oceanBottom = isEvening ? "#312e81" : "#0ea5e9";
  const sunColor = isEvening ? "#fb923c" : "#fde047";
  const sunStartY = isMorning ? 122 : isEvening ? 45 : 35;
  const sunEndY = isMorning ? 48 : isEvening ? 118 : 35;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-90 lg:opacity-100"
    >
      <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 900 220">
        <defs>
          <linearGradient id={`greeting-sky-${timeOfDay}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <linearGradient id={`greeting-ocean-${timeOfDay}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={oceanTop} />
            <stop offset="100%" stopColor={oceanBottom} />
          </linearGradient>
          <linearGradient id="greeting-sand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
        </defs>

        <rect width="900" height="220" fill={`url(#greeting-sky-${timeOfDay})`} />
        {isEvening && (
          <>
            <circle cx="650" cy="80" r="66" fill="#fb7185" opacity="0.16" />
            <path d="M360 112 H900" stroke="#fed7aa" strokeWidth="2" opacity="0.38" />
          </>
        )}
        <path
          d="M0 143 Q130 132 260 143 T520 143 T780 143 T1040 143 V220 H0Z"
          fill={`url(#greeting-ocean-${timeOfDay})`}
        />
        <motion.path
          d="M0 153 Q80 143 160 153 T320 153 T480 153 T640 153 T800 153 T960 153"
          fill="none"
          stroke="white"
          strokeWidth="3"
          opacity="0.72"
          animate={reduceMotion ? undefined : { x: [-45, 18, -45] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 171 Q65 164 130 171 T260 171 T390 171 T520 171 T650 171 T780 171 T910 171"
          fill="none"
          stroke="#cffafe"
          strokeWidth="2"
          opacity="0.6"
          animate={reduceMotion ? undefined : { x: [20, -35, 20] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <path d="M525 220 Q670 174 900 176 V220Z" fill="url(#greeting-sand)" opacity="0.96" />
        <path d="M565 220 Q690 187 900 188" fill="none" stroke="white" strokeWidth="4" opacity="0.62" />
      </svg>

      <motion.div
        className="absolute h-14 w-36 drop-shadow-[0_7px_8px_rgba(59,130,246,0.16)]"
        initial={{ left: reduceMotion ? "24%" : "7%" }}
        animate={{ left: reduceMotion ? "24%" : "104%" }}
        transition={{ duration: 19, repeat: Infinity, ease: "linear" }}
        style={{ top: "8%" }}
      >
        <svg viewBox="0 0 160 64" className="h-full w-full">
          <path
            d={CLOUD_PATH}
            fill="rgba(255,255,255,0.92)"
            stroke="rgba(191,219,254,0.9)"
            strokeWidth="2"
          />
        </svg>
      </motion.div>
      <motion.div
        className="absolute h-11 w-28 opacity-75 drop-shadow-[0_6px_7px_rgba(59,130,246,0.14)]"
        initial={{ left: reduceMotion ? "62%" : "43%" }}
        animate={{ left: reduceMotion ? "62%" : "104%" }}
        transition={{ duration: 27, repeat: Infinity, ease: "linear" }}
        style={{ top: "37%" }}
      >
        <svg viewBox="0 0 160 64" className="h-full w-full">
          <path
            d={CLOUD_PATH}
            fill="white"
            stroke="rgba(219,234,254,0.95)"
            strokeWidth="2"
          />
        </svg>
      </motion.div>

      <motion.div
        className="absolute left-[70%] h-12 w-12 rounded-full shadow-[0_0_32px_12px_rgba(253,224,71,0.38)]"
        style={{ backgroundColor: sunColor }}
        initial={{
          top: reduceMotion ? `${(sunEndY / 220) * 100}%` : `${(sunStartY / 220) * 100}%`,
          opacity: reduceMotion ? 1 : 0.45,
        }}
        animate={{ top: `${(sunEndY / 220) * 100}%`, opacity: 1 }}
        transition={{ duration: isEvening ? 4.5 : 3.2, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.16)_38%,rgba(255,255,255,0.02)_70%,transparent_100%)]" />
    </div>
  );
};

export default GreetingBeachScene;
