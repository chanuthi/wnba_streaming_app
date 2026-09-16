/**
 * Loads an image from a URL, flips it horizontally using a plain 2D canvas,
 * and returns a new data URL of the flipped result. Nothing here touches
 * Three.js/WebGL - this runs entirely in normal browser image/canvas APIs
 * before the result is ever handed to the 3D scene.
 */
export function flipImageHorizontally(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous"; // needed since the image comes from ESPN's CDN, not our own site
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get 2D canvas context"));
        return;
      }
      // The actual flip: move the origin to the right edge, then draw at negative scale
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL());
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
