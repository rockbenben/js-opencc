/**
 * 反查字典（`*Rev`）的生成逻辑，逐条对齐 OpenCC `data/scripts/common.py` 里的
 * `Dict.swap()`。
 *
 * 同步脚本是本模块唯一的运行时用户；单独成文件只为能被测试直接调用——验证生成器要
 * 重新生成字典，而重新生成会顺带刷新官方 testcases 夹具，那是另一件事的提交内容。
 */

const REVERSE_PREFER_PREFIX = "# @reverse-prefer:";

/**
 * `# @reverse-prefer: K [V]` —— 反查表里键 `K` 必须取候选 `V`。
 * 只写一个字段时 `V` 就是 `K` 本身，即「identity 优先」的显式写法（上游的 1-field form）。
 */
export function parseReversePreferences(raw: string): Map<string, string> {
  const preferences = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith(REVERSE_PREFER_PREFIX)) continue;
    const fields = text.slice(REVERSE_PREFER_PREFIX.length).trim().split(/\s+/).filter(Boolean);
    if (fields.length !== 1 && fields.length !== 2) {
      throw new Error(`Invalid reverse preference line: ${text}`);
    }
    preferences.set(fields[0], fields[fields.length - 1]);
  }
  return preferences;
}

/**
 * 正向文本 → `[key, value]` 的**全部**候选展开。
 *
 * 反查必须建在全部候选上：`JPShinjitaiCharacters` 有 `弁 → 辨 辯 瓣`，只取首候选会把
 * `辯 → 弁`、`瓣 → 弁` 丢掉，`t2jp` 于是把 `辯護士` 留在原地（官方用例 case_040 抓到过）。
 * 分隔符以首个制表符为准，值域内的空格只分候选——与 `parseOpenCCDict` 同一套宽容度。
 */
export function expandDictForReverse(raw: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const tab = text.indexOf("\t");
    if (tab < 0) continue;
    const key = text.slice(0, tab);
    for (const value of text.slice(tab + 1).trim().split(/\s+/).filter(Boolean)) {
      entries.push([key, value]);
    }
  }
  return entries;
}

/**
 * `value → key` 反查，每个反查键只留一个候选（打包格式是一本 trie 一个值）。
 *
 * 选哪个，优先级和上游一致：
 *
 * 1. `@reverse-prefer` 点名的候选——它被提到该键候选列表的首位。
 * 2. 没有偏好的键，identity 候选（`才 → 才`）压过文件顺序。上游没有这条兜底：今天
 *    `HKVariants` / `TWVariants` / `JPShinjitaiCharacters` 里 identity 恰好码位最小、
 *    排在最前，first-wins 已经选中它。那是当前码位表的巧合，不是上游契约——将来某组
 *    候选把 identity 排在后面，没有这条兜底就会发错映射。别以「从没命中过」为理由删它。
 * 3. 两者都没有时取文件顺序的第一个（词典把想用的词排在前面）。
 */
export function reverseEntries(entries: Array<[string, string]>, preferences: Map<string, string> = new Map()): Array<[string, string]> {
  const candidates = new Map<string, string[]>();
  for (const [key, value] of entries) {
    const list = candidates.get(value);
    if (list) list.push(key);
    else candidates.set(value, [key]);
  }

  for (const [key, preferred] of preferences) {
    const list = candidates.get(key);
    if (!list || !list.includes(preferred)) {
      // 上游同样抛错（common.py 的 ValueError）：偏好指向一个不存在的候选，说明词典
      // 与注释已经不一致。静默忽略等于照发一条没人要求的映射。
      throw new Error(`@reverse-prefer: ${key} -> ${preferred} has no matching mapping`);
    }
    list.unshift(list.splice(list.indexOf(preferred), 1)[0]);
  }

  const out: Array<[string, string]> = [];
  for (const [value, keys] of candidates) {
    if (preferences.has(value)) {
      out.push([value, keys[0]]);
      continue;
    }
    const identity = keys.find((key) => key === value);
    out.push([value, identity ?? keys[0]]);
  }
  return out;
}
