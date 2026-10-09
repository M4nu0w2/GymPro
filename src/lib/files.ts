import { isIOS } from './utils';

/**
 * Salva un file. Su iOS usa il foglio di condivisione (che offre "Salva su File"),
 * perché i download via <a download> nella PWA standalone non sono affidabili.
 */
export async function saveFile(filename: string, content: string, mime: string): Promise<void> {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      // altrimenti fallback al download classico
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Apre il selettore file e restituisce il contenuto testuale */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      resolve({ name: f.name, text: await f.text() });
    };
    document.body.appendChild(input);
    input.click();
  });
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
