import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
export function useActiveOrderTab(enabled=true) {
 const [eligible, setEligible] = useState(false);
 useEffect(() => {
  if(!enabled)return;
  let alive = true, revision = 0;
  const check = async () => {
   const run = ++revision;
   try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    let valid = false;
    if (tabs.length === 1 && tabs[0]?.url) {
     const url = new URL(tabs[0].url);
     valid = url.origin === "https://www.amazon.ca" && !url.username && !url.password && /^\/your-orders\/order-details\/?$/.test(url.pathname);
    }
    if (alive && run === revision) setEligible(valid);
   } catch { if (alive && run === revision) setEligible(false); }
  };
  const changed = () => { setEligible(false); void check(); };
  browser.tabs.onActivated.addListener(changed); browser.tabs.onUpdated.addListener(changed); browser.tabs.onRemoved.addListener(changed);
  const timer = setInterval(() => void check(), 1000); void check();
  return () => { alive = false; clearInterval(timer); browser.tabs.onActivated.removeListener(changed); browser.tabs.onUpdated.removeListener(changed); browser.tabs.onRemoved.removeListener(changed); };
 }, [enabled]);
 return enabled&&eligible;
}
