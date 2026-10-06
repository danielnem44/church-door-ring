// The door team: people who get the WhatsApp message.
// Set the environment variable DOOR_TEAM like this:
//   DOOR_TEAM="Daniel:+4791234567, Anna:+4798765432"
// Numbers must include the country code. Spaces are fine.

export function normalizeNumber(n) {
  return String(n || "").replace(/[^\d]/g, ""); // WhatsApp uses digits only, e.g. 4791234567
}

export function getTeam() {
  return String(process.env.DOOR_TEAM || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.lastIndexOf(":");
      const name = i > 0 ? entry.slice(0, i).trim() : "";
      const number = normalizeNumber(i > 0 ? entry.slice(i + 1) : entry);
      return { name: name || "Someone", number };
    })
    .filter((m) => m.number.length >= 8);
}

export function findMember(number) {
  const n = normalizeNumber(number);
  return getTeam().find((m) => m.number === n) || null;
}
