import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * True on a phone-width screen.
 *
 * It is false on the server and for the first paint in the browser, and
 * switches just after. Reading the width during that first paint would make
 * the browser's markup differ from the server's on a phone.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    const firstRead = requestAnimationFrame(update);
    return () => {
      media.removeEventListener("change", update);
      cancelAnimationFrame(firstRead);
    };
  }, []);

  return isMobile;
}
