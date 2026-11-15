// プロフィール写真(アンケートでアップロードされた写真)の検証・変換・保存

// 1枚の上限。480×480 の JPEG に縮めたあとの大きさで、ふつうは 100KB 以下になる
export const MAX_PHOTO_BYTES = 300 * 1024;
// フォームでアップロードされた元の写真の上限(スマホの写真は数MBあるため、縮める前は大きく許す)
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
// 縮めたあとの一辺(正方形)
export const PHOTO_SIZE = 480;

// JPEG の先頭の印(FF D8 FF)かを調べる。画像でないものを保存しない
export function isJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(text) {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

// 写真のURL。?v= は更新時刻で、差し替えたときにブラウザが古い写真を使い続けないようにする
export function photoUrl(slug, version) {
  return `/api/photo/${slug}?v=${version}`;
}

// 元の写真を、正方形(中央を切り抜き)の JPEG に縮める。位置情報などの余計な情報も消える
// Cloudflare の画像変換(IMAGES)を使う。JPEG・PNG・WebP・HEIC などを読める
export async function resizeToJpeg(env, bytes) {
  const result = await env.IMAGES.input(new Blob([bytes]).stream())
    .transform({ width: PHOTO_SIZE, height: PHOTO_SIZE, fit: 'cover' })
    .output({ format: 'image/jpeg', quality: 85 });
  return new Uint8Array(await result.response().arrayBuffer());
}

// 会員の写真を保存する(すでにあれば差し替える)
export async function saveMemberPhoto(db, memberId, bytes) {
  await db.prepare(`
    INSERT INTO member_photos (member_id, data_base64, size, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET data_base64 = excluded.data_base64, size = excluded.size, updated_at = excluded.updated_at`)
    .bind(memberId, toBase64(bytes), bytes.length, Math.floor(Date.now() / 1000)).run();
}
