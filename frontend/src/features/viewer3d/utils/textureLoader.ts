import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * React hook that loads a Three.js texture from a URL.
 * Returns null while loading or if url is null/undefined.
 * Handles errors gracefully by returning null.
 */
export function useImageTexture(url: string | null | undefined): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    let disposed = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (loaded) => {
        if (!disposed) {
          loaded.colorSpace = THREE.SRGBColorSpace;
          setTexture(loaded);
        }
      },
      undefined,
      () => {
        // Error loading texture - fail silently
        if (!disposed) {
          setTexture(null);
        }
      }
    );

    return () => {
      disposed = true;
      if (texture) {
        texture.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return texture;
}
