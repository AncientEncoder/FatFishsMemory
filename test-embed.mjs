import { env, pipeline } from '@huggingface/transformers'
env.localModelPath = 'C:/Users/Varia/.dsh/fatfish-memory/models'
env.allowRemoteModels = false
env.allowLocalModels = true
try {
  const ex = await pipeline('feature-extraction', 'bge-small-zh-v1.5', { quantized: true })
  const out = await ex(['服务器 ssh 连不上', 'NAS 服务器', '今天玩如龙'], { pooling: 'mean', normalize: true })
  console.log('dims:', out.dims)
  const [a, b, c] = out.tolist()
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0)
  console.log('sim(服务器ssh, NAS服务器) =', dot(a, b).toFixed(4))
  console.log('sim(服务器ssh, 今天玩如龙) =', dot(a, c).toFixed(4))
} catch (e) {
  console.error('FAILED:', e.message)
}
