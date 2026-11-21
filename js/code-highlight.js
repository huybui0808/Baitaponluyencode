// Offline C++ token coloring for the dark editor theme.
const tokenPattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|^[\t ]*\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:alignas|alignof|asm|auto|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|concept|const|consteval|constexpr|constinit|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|private|protected|public|register|requires|return|short|signed|sizeof|static|static_assert|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b|\b(?:string|vector|array|map|unordered_map|set|unordered_set|pair|tuple|stack|queue|deque|list|size_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t)\b|\b(?:std|cout|cin|cerr|clog|endl|printf|scanf|main)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*\b|\b[A-Za-z_][A-Za-z_0-9]*(?=\s*\()|(?:\+\+|--|->|::|<<=?|>>=?|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|[+*/%=&|!<>^~?:.-])/gm;
const keywords = new Set("alignas alignof asm auto bool break case catch char char8_t char16_t char32_t class concept const consteval constexpr constinit continue co_await co_return co_yield decltype default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register requires return short signed sizeof static static_assert struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while".split(" "));
const types = new Set("string vector array map unordered_map set unordered_set pair tuple stack queue deque list size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t".split(" "));
const literals = new Set(["true", "false", "nullptr"]);
const escapeHTML = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function renderCppHighlight(source, target) {
  if (!target) return;
  const html = [];
  let cursor = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index;
    html.push(escapeHTML(source.slice(cursor, index)));
    let kind = "";
    if (token.startsWith("//") || token.startsWith("/*")) kind = "comment";
    else if (token.trimStart().startsWith("#")) kind = "preprocessor";
    else if (token.startsWith('"') || token.startsWith("'")) kind = "string";
    else if (literals.has(token)) kind = "literal";
    else if (keywords.has(token)) kind = "keyword";
    else if (types.has(token)) kind = "type";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^[+*/%=&|!<>^~?:.-]/.test(token)) kind = "operator";
    else if (/^[A-Za-z_]/.test(token)) kind = "function";
    html.push(kind ? `<span class="cpp-${kind}">${escapeHTML(token)}</span>` : escapeHTML(token));
    cursor = index + token.length;
  }
  html.push(escapeHTML(source.slice(cursor)));
  target.innerHTML = html.join("") + (source.endsWith("\n") ? " " : "\n");
}
