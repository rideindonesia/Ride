import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";

export default function SplashScreen() {
  const [, navigate] = useLocation();

  const { data, isError, isSuccess } = useGetMe({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (isSuccess && data) {
      const timer = setTimeout(() => {
        navigate("/login");
      }, 2500);
      return () => clearTimeout(timer);
    }

    if (isError) {
      const timer = setTimeout(() => {
        navigate("/login");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, isError, data, navigate]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 30%, #1c4a5a 60%, #1a6060 80%, #1a7a6a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.04)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -60,
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.03)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        <HexagonLogo />

        <div
          style={{
            marginTop: 40,
            color: "#ffffff",
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "0.18em",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          RIDE
        </div>

        <div
          style={{
            marginTop: 14,
            color: "rgba(255,255,255,0.65)",
            fontSize: 15,
            fontWeight: 400,
            letterSpacing: "0.01em",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Super App Jasa Panggilan
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 48,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ width: 28, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.85)" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent" }} />
      </div>
    </div>
  );
}

function HexagonLogo() {
  return (
    <svg
      width="120"
      height="134"
      viewBox="0 0 120 134"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="60,4 112,33 112,101 60,130 8,101 8,33"
        stroke="rgba(100,200,200,0.7)"
        strokeWidth="3"
        fill="none"
      />
      <polygon
        points="60,18 98,40 98,94 60,116 22,94 22,40"
        stroke="rgba(80,180,180,0.5)"
        strokeWidth="2"
        fill="none"
      />
      <text
        x="60"
        y="78"
        textAnchor="middle"
        fill="rgba(255,255,255,0.9)"
        fontSize="38"
        fontWeight="700"
        fontFamily="'Inter', sans-serif"
      >
        R
      </text>
    </svg>
  );
}
