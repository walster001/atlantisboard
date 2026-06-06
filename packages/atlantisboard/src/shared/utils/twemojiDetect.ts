import twemoji from 'twemoji';

/** Whether Twemoji treats `text` as a replaceable emoji grapheme. */
export function twemojiRecognizesGrapheme(text: string): boolean {
  return (twemoji as unknown as { test(s: string): boolean }).test(text);
}
