// Дополнения для старых браузеров (например, встроенного браузера Telegram
// на старых планшетах Android). Подключаются только в совместимой версии.

if (!Object.fromEntries) {
  Object.fromEntries = (entries) => {
    const obj = {};
    for (const [k, v] of entries) obj[k] = v;
    return obj;
  };
}
if (!String.prototype.padStart) {
  // eslint-disable-next-line no-extend-native
  String.prototype.padStart = function padStart(len, fill = ' ') {
    let s = String(this);
    while (s.length < len) s = fill + s;
    return s.slice(-Math.max(len, String(this).length));
  };
}
