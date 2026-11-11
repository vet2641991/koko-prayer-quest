// Lesson videos and their posters live in Cloudflare R2 (served by the koko-media Worker), not in the repo, so the
// static site stays under the GitHub Pages size cap. Content keeps the path "media/<lesson>.mp4"; only the host changes.
// media/remote.json lists every file uploaded there (path -> bytes, sha256), for validation and the media register.
export const MEDIA_URL = 'https://koko-media.hassanvetawy.workers.dev';

/** A lesson video or poster (served from R2), as opposed to app images such as media/koko-wave.png. */
export const isRemoteMedia = (path: string) => /^media\/[\w.-]+(\.mp4|-poster\.(jpe?g|png|webp))$/.test(path);

export type RemoteManifest = Record<string, { bytes: number; sha256: string }>;
