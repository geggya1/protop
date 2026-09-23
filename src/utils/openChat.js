let openChatId = null;

export function setOpenChatId(chatId) {
  openChatId = chatId || null;
}

export function getOpenChatId() {
  return openChatId;
}
