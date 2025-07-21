let mastersData = null;
let lastOrderNumber = null;

// Загрузка данных мастеров
async function loadMastersData() {
  try {
    const response = await fetch(chrome.runtime.getURL('masters.json'));
    mastersData = await response.json();
    return true;
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
    return false;
  }
}

// Функция для извлечения данных мастера
async function extractMasterDataUsingXPath() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const xpath = "/html/body/div[2]/div/div/div[7]/div/div/div[2]/b[7]";
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue?.nextSibling?.textContent?.trim() || null;
      }
    });
    
    return result[0].result;
  } catch (error) {
    console.error('Ошибка при извлечении данных мастера:', error);
    return null;
  }
}

function getMasterFullName(shortName) {
  if (!shortName || !mastersData) return "не найден";
  const lastName = shortName.split(" ")[0];
  return mastersData[lastName] || "не найден";
}

// Функция для анализа таблицы
async function analyzeTable(orderNumbers) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (orderNumbers) => {
        const xpath = "/html/body/div[2]/div/div/table[2]";
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        
        const table = result.singleNodeValue;
        if (!table) return null;
        
        const rows = table.querySelectorAll('tbody tr');
        let found = false;
        const statusCounts = {
          success: 0,
          noAnswer: 0,
          refused: 0,
          notFilled: 0
        };
        
        const orderNumbersArray = orderNumbers.split(',').map(num => num.trim());
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 9) continue;
          
          const currentOrder = cells[1].textContent.trim();
          
          if (orderNumbersArray.includes(currentOrder)) {
            found = true;
          }
          
          if (found) {
            const status = cells[4].textContent.trim();
            if (status === 'успех') statusCounts.success++;
            else if (status.startsWith('не алло')) statusCounts.noAnswer++;
            else if (status === 'отказ от общения') statusCounts.refused++;
            else if (status === 'не заполнен') statusCounts.notFilled++;
          }
        }
        
        return {
          found: found,
          counts: statusCounts
        };
      },
      args: [orderNumbers]
    });
    
    return result[0].result;
  } catch (error) {
    console.error('Ошибка при анализе таблицы:', error);
    return null;
  }
}

// Функция для сохранения номера заявки
function saveOrderNumber(orderNumber) {
  lastOrderNumber = orderNumber;
  chrome.storage.local.set({ lastOrderNumber: orderNumber });
}

// Функция для загрузки сохраненного номера заявки
function loadOrderNumber() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lastOrderNumber'], (result) => {
      resolve(result.lastOrderNumber || '');
    });
  });
}

// Инициализация
async function init() {
  const statusElement = document.getElementById('status');
  const resultElement = document.getElementById('result');
  const tableResultElement = document.getElementById('table-result');
  const orderNumberInput = document.getElementById('orderNumber');
  const calculateBtn = document.getElementById('calculateBtn');
  
  // Загружаем сохраненный номер заявки
  const savedOrderNumber = await loadOrderNumber();
  if (savedOrderNumber) {
    orderNumberInput.value = savedOrderNumber;
    lastOrderNumber = savedOrderNumber;
  }
  
  // Загружаем данные мастеров
  statusElement.textContent = "Загрузка данных мастеров...";
  const dataLoaded = await loadMastersData();
  
  if (!dataLoaded) {
    statusElement.textContent = "Ошибка загрузки данных мастеров";
    return;
  }
  
  // Ищем данные мастера
  statusElement.textContent = "Поиск данных мастера на странице...";
  const masterData = await extractMasterDataUsingXPath();
  
  if (masterData) {
    const fullName = getMasterFullName(masterData);
    resultElement.textContent = `Мастер: ${fullName}`;
    statusElement.textContent = "";
  } else {
    resultElement.textContent = "Данные мастера не найдены";
    statusElement.textContent = "";
  }
  
  // Обработчик кнопки "Посчитать" с измененной проверкой ввода
  calculateBtn.addEventListener('click', async () => {
    const orderNumbers = orderNumberInput.value.trim();
    
    if (!orderNumbers || !/^[0-9]+(,[0-9]+)*$/.test(orderNumbers)) {
      tableResultElement.textContent = "Введите номера заявок через запятую (только цифры)";
      return;
    }
    
    saveOrderNumber(orderNumbers);
    statusElement.textContent = `Анализ заявок начиная с ${orderNumbers}...`;
    
    const analysisResult = await analyzeTable(orderNumbers);
    
    if (!analysisResult || !analysisResult.found) {
      tableResultElement.textContent = "Заявка не найдена или произошла ошибка";
      return;
    }
    
    const { counts } = analysisResult;
    const totalCalls = counts.success + counts.noAnswer;
    
    tableResultElement.innerHTML = `
      <strong>Результаты анализа:</strong><br>
      Всего звонков: ${totalCalls}<br>
      Успех: ${counts.success}<br>
      Не алло: ${counts.noAnswer}<br>
      Отказ от общения: ${counts.refused}<br>
      Не заполнен: ${counts.notFilled}
    `;
    
    statusElement.textContent = "";
  });
}

// Запускаем при открытии
document.addEventListener('DOMContentLoaded', init);