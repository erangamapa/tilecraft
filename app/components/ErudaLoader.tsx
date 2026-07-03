'use client';

import { useEffect } from 'react';

export default function ErudaLoader() {
  useEffect(() => {
    // Only load Eruda in development or when ?debug=true is in URL
    const isDev = process.env.NODE_ENV === 'development';
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug') === 'true';
    
    if (isDev || debugParam) {
      import('eruda').then((eruda) => {
        eruda.default.init();
      });
    }
  }, []);

  return null;
}
