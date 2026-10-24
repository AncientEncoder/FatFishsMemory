/**
 * 本地向量：不依赖任何模型、不联网。
 *
 * 用字符 n-gram（中文）+ 单词（英文）哈希到一个固定维度，
 * 再做余弦相似度。它不是真正的语义向量，但能做到：
 *
 *   「服务器」↔「NAS」  这种共现词命中不了，
 *   但「服务器」↔「服务器集群」「ssh 服务器」这类字面相关的能命中，
 *   而且不需要把任何东西发出去。
 *
 * 以后接真 embedding 时，只要换掉 embed()，接口不变。
 */

const DIM = 512

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % DIM
}

export function embed(text) {
  const vec = new Float32Array(DIM)
  const str = String(text || '').toLowerCase().replace(/\s+/g, ' ')

  // 中文按 2-gram / 3-gram
  for (let n = 2; n <= 3; n += 1) {
    for (let i = 0; i + n <= str.length; i += 1) {
      const gram = str.slice(i, i + n)
      if (!/[\u4e00-\u9fa5]/.test(gram)) continue
      vec[hash(gram)] += 1
    }
  }
  // 英文/数字按单词
  for (const word of str.match(/[a-z0-9_]{2,}/g) || []) {
    vec[hash(word)] += 1
  }

  let norm = 0
  for (let i = 0; i < DIM; i += 1) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i += 1) vec[i] /= norm
  return vec
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i]
  return dot
}

/** 一次性比较：query 向量与文本的相似度。 */
export function similarity(queryVec, text) {
  return cosine(queryVec, embed(text))
}
