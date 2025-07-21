// Файл: background.js
let popupWindowId = null;

// Открываем popup в отдельном окне
chrome.action.onClicked.addListener(async () => {
  // Если окно уже открыто - фокусируем его
  if (popupWindowId) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (e) {
      popupWindowId = null; // Окно было закрыто вручную
    }
  }

  // Создаем новое окно
  const popup = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 400,
    height: 300,
    left: screen.width - 450, // Позиция справа
  });

  popupWindowId = popup.id;
});