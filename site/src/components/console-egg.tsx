"use client";

import { useEffect } from "react";

const INVARO = String.raw`
  \  |  /    _
   \ | /    (_)_ ____   ____ _ _ __ ___
 --- * ---  | | '_ \ \ / / _' | '__/ _ \
   / | \    | | | | \ V / (_| | | | (_) |
  /  |  \   |_|_| |_|\_/ \__,_|_|  \___/
`;

const OPENTAX = String.raw`
                        _
  ___  _ __   ___ _ __ | |_ __ ___  __
 / _ \| '_ \ / _ \ '_ \| __/ _' \ \/ /
| (_) | |_) |  __/ | | | || (_| |>  <
 \___/| .__/ \___|_| |_|\__\__,_/_/\_\
      |_|
`;

declare global {
  interface Window {
    __opentaxConsole?: boolean;
  }
}

export function ConsoleEgg() {
  useEffect(() => {
    if (window.__opentaxConsole) return;
    window.__opentaxConsole = true;

    console.log(
      "%c" + OPENTAX,
      "color:#fafafa;font-family:monospace;font-size:12px;line-height:1.2;",
    );
    console.log(
      "%c" + INVARO,
      "color:#8a8a8a;font-family:monospace;font-size:11px;line-height:1.2;",
    );
    console.log(
      "%can INVARO company · invaro.ai",
      "color:#fafafa;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1px;",
    );
    console.log(
      "%c> 6% → 96%. Same model. This engine.",
      "color:#fafafa;font-family:monospace;font-size:13px;font-weight:700;",
    );
    console.log(
      "%cYou're reading the console. Deterministic people are our favorite kind.\n" +
        "Every rule in this engine cites its statute, and every answer carries a proof.\n" +
        "Don't take the page's word for it, ask the engine yourself:",
      "color:#8a8a8a;font-family:monospace;font-size:12px;line-height:1.6;",
    );
    console.log(
      "%cfetch('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'calculate_tax',arguments:{filing:{filingStatus:'mfj'},income:{wages:120000},credits:{qualifyingChildren:2},asOf:'2025-12-31'}}})}).then(r=>r.json()).then(d=>console.log(JSON.parse(d.result.content[0].text).answer))",
      "color:#6a6a6a;font-family:monospace;font-size:11px;",
    );
    console.log(
      "%cPaste that. It computes a real return, right here, deterministically.\n\n" +
        "→ source   https://github.com/Invaro/opentax-engine\n" +
        "→ connect  https://opentax.invaro.ai/mcp\n" +
        "→ Invaro, the company behind OpenTax. Build finance for the AI economy: https://invaro.ai",
      "color:#8a8a8a;font-family:monospace;font-size:12px;line-height:1.6;",
    );
  }, []);

  return null;
}
