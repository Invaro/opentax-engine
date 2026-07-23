import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "OpenTax: 6% to 96% exact tax returns with the same model";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#121212",
          color: "#fafafa",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: -0.5 }}>✳ opentax</div>
          <div style={{ display: "flex", fontSize: 20, color: "#8a8a8a" }}>by Invaro</div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 48 }}>
          <div style={{ display: "flex", fontSize: 160, color: "#5a5a5a" }}>6%</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 22, color: "#8a8a8a" }}>+ OpenTax MCP</div>
            <div style={{ display: "flex", fontSize: 48, color: "#8a8a8a" }}>→</div>
          </div>
          <div style={{ display: "flex", fontSize: 200, fontWeight: 700 }}>96%</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#c9c9c9", maxWidth: 720 }}>
            Turn any AI into a precise tax preparer. Deterministic, open source, the highest
            score ever recorded on TaxCalcBench.
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#8a8a8a" }}>
            opentax.invaro.ai/mcp
          </div>
        </div>
      </div>
    ),
    size,
  );
}
