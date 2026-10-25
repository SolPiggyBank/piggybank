// All interface text, Russian and English side by side; the other languages
// have their own files (es.jsx, fr.jsx…) with the same keys.
// A value is a string with {placeholders}, a function (vars) => string | JSX,
// or for counted words an array of forms: ru [one, few, many], en [one, other].

export const STRINGS = {
  // ---------------------------------------------------------------- common
  'common.continue': { ru: 'Продолжить', en: 'Continue' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.copy': { ru: 'Копировать', en: 'Copy' },
  'common.copied': { ru: 'Скопировано', en: 'Copied' },
  'common.copyFailed': { ru: 'Не удалось скопировать', en: 'Couldn’t copy' },
  'common.password': { ru: 'Пароль', en: 'Password' },
  'common.showPassword': { ru: 'Показать пароль', en: 'Show password' },
  'common.hidePassword': { ru: 'Скрыть пароль', en: 'Hide password' },
  'common.tapToReveal': { ru: 'Нажмите, чтобы показать', en: 'Tap to reveal' },
  'common.seedPhrase': { ru: 'Секретная фраза', en: 'Recovery phrase' },
  'common.privateKey': { ru: 'Приватный ключ', en: 'Private key' },
  'common.all': { ru: 'Всё', en: 'All' },
  'common.max': { ru: 'Максимум', en: 'Max' },
  'common.token': { ru: 'Токен', en: 'Token' },
  'common.amountIn': { ru: 'Сумма в {symbol}', en: 'Amount in {symbol}' },
  'common.step': { ru: 'Шаг {n} из {total}', en: 'Step {n} of {total}' },
  'common.saving': { ru: 'Сохраняем…', en: 'Saving…' },
  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.retry': { ru: 'Повторить', en: 'Try again' },
  'common.goHome': { ru: 'На главную', en: 'Back to home' },
  'common.pig': { ru: 'Копилка', en: 'Piggy bank' },
  'pig.oink': { ru: 'Хрю!', en: 'Oink!' },

  'q': { ru: '«{x}»', en: '“{x}”' },
  'unit.days': { ru: ['{n} день', '{n} дня', '{n} дней'], en: ['{n} day', '{n} days'] },
  'unit.goals': { ru: ['{n} цель', '{n} цели', '{n} целей'], en: ['{n} goal', '{n} goals'] },

  'unit.daysLeft': { ru: ['ещё {n} день', 'ещё {n} дня', 'ещё {n} дней'], en: ['{n} day left', '{n} days left'] },
  'days.passed': { ru: 'срок прошёл', en: 'past the deadline' },
  'days.lastDay': { ru: 'сегодня последний день', en: 'last day today' },
  'date.today': { ru: 'Сегодня', en: 'Today' },
  'date.yesterday': { ru: 'Вчера', en: 'Yesterday' },

  // ---------------------------------------------------------------- onboarding
  'welcome.title': { ru: 'Копите на цели в долларах', en: 'Save for your goals in dollars' },
  'welcome.lead': {
    ru: 'Кошелёк-копилка в сети Solana: ставьте цели и откладывайте USDC, USDT и SOL.',
    en: 'A piggy bank wallet on Solana: set goals and put aside USDC, USDT and SOL.',
  },
  'welcome.perkGoals': {
    ru: 'Цели со сроками: отпуск, телефон, подушка безопасности',
    en: 'Goals with deadlines: a trip, a new phone, an emergency fund',
  },
  'welcome.perkKeys': {
    ru: 'Ключи только у вас, зашифрованы паролем в браузере',
    en: 'Your keys stay with you, encrypted by your password',
  },
  'welcome.perkDeposit': {
    ru: 'Пополнение с биржи или кошелька по QR-коду',
    en: 'Top up from an exchange or wallet with a QR code',
  },
  'welcome.create': { ru: 'Создать копилку', en: 'Create piggy bank' },
  'welcome.haveWallet': { ru: 'У меня уже есть кошелёк', en: 'I already have a wallet' },

  'pw.title': { ru: 'Придумайте пароль', en: 'Create a password' },
  'pw.lead': {
    ru: 'Он шифрует ключи на этом компьютере и открывает копилку. Если забудете пароль, войти можно будет только по секретной фразе.',
    en: 'It encrypts your keys on this computer and opens the piggy bank. If you forget it, only your recovery phrase can get you back in.',
  },
  'pw.min8': { ru: 'Минимум 8 символов', en: 'At least 8 characters' },
  'pw.tooShort': { ru: 'Нужно хотя бы 8 символов', en: 'Use at least 8 characters' },
  'pw.strength1': { ru: 'Слабый пароль', en: 'Weak password' },
  'pw.strength2': { ru: 'Средний пароль', en: 'Fair password' },
  'pw.strength3': { ru: 'Хороший пароль', en: 'Good password' },
  'pw.strength4': { ru: 'Надёжный пароль', en: 'Strong password' },
  'pw.repeat': { ru: 'Повторите пароль', en: 'Repeat password' },
  'pw.again': { ru: 'Ещё раз', en: 'Once more' },
  'pw.mismatch': { ru: 'Пароли не совпадают', en: 'Passwords don’t match' },
  'pw.saveFailed': { ru: 'Не удалось сохранить кошелёк: {reason}', en: 'Couldn’t save the wallet: {reason}' },

  'seed.lead': {
    ru: 'Эти 12 слов восстановят копилку, если вы забудете пароль или смените компьютер. Запишите их по порядку на бумаге.',
    en: 'These 12 words restore your piggy bank if you forget the password or switch computers. Write them down on paper, in order.',
  },
  'seed.warn': {
    ru: 'Кто знает эти слова, тот распоряжается деньгами. Никому их не сообщайте и не храните в скриншотах.',
    en: 'Anyone who knows these words controls the money. Never share them and don’t keep them in screenshots.',
  },
  'seed.copy': { ru: 'Скопировать слова', en: 'Copy words' },
  'seed.wroteDown': { ru: 'Я записал слова', en: 'I’ve written them down' },
  'seed.later': { ru: 'Сделаю это позже', en: 'I’ll do it later' },

  'verify.title': { ru: 'Проверим запись', en: 'Let’s check your copy' },
  'verify.lead': { ru: 'Выберите слова под указанными номерами.', en: 'Pick the words with these numbers.' },
  'verify.word': { ru: 'Слово №{n}', en: 'Word #{n}' },
  'verify.creating': { ru: 'Создаём копилку…', en: 'Creating piggy bank…' },
  'verify.showAgain': { ru: 'Посмотреть слова ещё раз', en: 'See the words again' },
  'verify.createFailed': { ru: 'Не удалось создать кошелёк: {reason}', en: 'Couldn’t create the wallet: {reason}' },

  'skip.title': { ru: 'Пропустить запись фразы?', en: 'Skip writing down the phrase?' },
  'skip.text': {
    ru: 'Без записанной фразы копилку не восстановить, если вы забудете пароль или переустановите браузер. Напоминание останется на главном экране, а фразу можно будет посмотреть в настройках.',
    en: 'Without the phrase you can’t restore the piggy bank if you forget the password or reinstall the browser. A reminder will stay on the home screen, and you can view the phrase in Settings.',
  },
  'skip.goBack': { ru: 'Вернуться и записать', en: 'Go back and write it down' },
  'skip.anyway': { ru: 'Всё равно пропустить', en: 'Skip anyway' },

  'import.title': { ru: 'Импорт кошелька', en: 'Import a wallet' },
  'import.lead': {
    ru: 'Перенесите кошелёк из Phantom, Solflare, Backpack или solana-keygen.',
    en: 'Bring over a wallet from Phantom, Solflare, Backpack or solana-keygen.',
  },
  'import.phPhrase': { ru: '12 или 24 слова через пробел', en: '12 or 24 words separated by spaces' },
  'import.phKey': { ru: 'Например, 4Zx9… (base58) или [12, 34, …]', en: 'For example 4Zx9… (base58) or [12, 34, …]' },
  'import.wordCount': { ru: 'Слов: {n}. Нужно 12 или 24.', en: '{n} words. You need 12 or 24.' },
  'import.badPhrase': {
    ru: 'Фраза не проходит проверку. Проверьте слова и порядок.',
    en: 'This phrase doesn’t check out. Check the words and their order.',
  },
  'import.looksLikePhrase': {
    ru: 'Похоже на секретную фразу — переключитесь на вкладку слева.',
    en: 'This looks like a recovery phrase. Switch to the tab on the left.',
  },
  'import.keyShort': {
    ru: 'Ключ неполный: должно быть 64 байта (88 символов base58).',
    en: 'The key is incomplete: it should be 64 bytes (88 base58 characters).',
  },
  'import.keyFormat': {
    ru: 'Не похоже на приватный ключ. Подойдёт строка base58 или массив чисел [12, 34, …].',
    en: 'This doesn’t look like a private key. Use a base58 string or a number array [12, 34, …].',
  },
  'import.keyBroken': {
    ru: 'Ключ повреждён: публичная часть не совпадает.',
    en: 'The key is damaged: its public part doesn’t match.',
  },
  'import.ok': { ru: 'Ключ подходит. Адрес кошелька:', en: 'Key accepted. Wallet address:' },
  'import.willFind': {
    ru: 'Дальше найдём счёт, на котором лежат ваши средства.',
    en: 'Next we’ll find the account that holds your funds.',
  },
  'import.private': {
    ru: 'Ключ шифруется вашим паролем и никуда не отправляется.',
    en: 'The key is encrypted with your password and never leaves this browser.',
  },
  'import.searching': { ru: 'Ищем кошелёк…', en: 'Looking for your wallet…' },

  'ready.title': { ru: 'Копилка готова', en: 'Your piggy bank is ready' },
  'ready.lead': {
    ru: 'Пополните её и поставьте первую цель — так копить проще.',
    en: 'Top it up and set your first goal — saving is easier with one.',
  },
  'ready.leadImported': {
    ru: 'Кошелёк импортирован. Поставьте цель и разложите по ней свои сбережения.',
    en: 'Wallet imported. Set a goal and put your savings toward it.',
  },
  'ready.firstGoal': { ru: 'Поставить первую цель', en: 'Set your first goal' },
  'ready.toHome': { ru: 'Перейти в копилку', en: 'Go to piggy bank' },

  'unlock.title': { ru: 'С возвращением', en: 'Welcome back' },
  'unlock.hello': { ru: 'Хрю, привет!', en: 'Oink, hello!' },
  'unlock.lead': { ru: 'Введите пароль, чтобы открыть копилку.', en: 'Enter your password to open the piggy bank.' },
  'unlock.open': { ru: 'Открыть копилку', en: 'Open piggy bank' },
  'unlock.opening': { ru: 'Открываем…', en: 'Opening…' },
  'unlock.forgot': { ru: 'Забыли пароль?', en: 'Forgot password?' },
  'unlock.wrong': { ru: 'Неверный пароль', en: 'Wrong password' },
  'unlock.failed': { ru: 'Не удалось открыть: {reason}', en: 'Couldn’t open: {reason}' },

  // ---------------------------------------------------------------- tabs & home
  'tabs.home': { ru: 'Копилка', en: 'Piggy' },
  'tabs.goals': { ru: 'Цели', en: 'Goals' },
  'tabs.history': { ru: 'История', en: 'History' },
  'tabs.label': { ru: 'Разделы', en: 'Sections' },

  'home.addrCopied': { ru: 'Адрес скопирован', en: 'Address copied' },
  'home.copyAddr': { ru: 'Скопировать адрес', en: 'Copy address' },
  'home.lock': { ru: 'Запереть копилку', en: 'Lock piggy bank' },
  'home.balance': { ru: 'Баланс копилки', en: 'Piggy bank balance' },
  'home.pigLabel': { ru: 'Копилка заполнена на {pct}% от целей', en: 'Piggy bank is {pct}% of the way to your goals' },
  'home.total': { ru: 'Всего в копилке', en: 'Total in piggy bank' },
  'home.showBalance': { ru: 'Показать баланс', en: 'Show balance' },
  'home.hideBalance': { ru: 'Скрыть баланс', en: 'Hide balance' },
  'home.inGoals': { ru: 'В целях', en: 'In goals' },
  'home.free': { ru: 'Свободно', en: 'Available' },
  'home.depositArrived': { ru: 'Пополнение пришло. Отложить в цель?', en: 'Money arrived. Put it toward a goal?' },
  'home.putAside': { ru: 'Отложить', en: 'Put aside' },
  'home.dismiss': { ru: 'Скрыть', en: 'Dismiss' },
  'home.backupTitle': { ru: 'Запишите секретную фразу.', en: 'Write down your recovery phrase.' },
  'home.backupText': { ru: 'Без неё копилку не восстановить.', en: 'Without it the piggy bank can’t be restored.' },
  'home.backupNow': { ru: 'Записать сейчас', en: 'Write it down now' },
  'home.shortfall': {
    ru: 'На кошельке меньше, чем отложено в цели. Возможно, деньги отправили из другого приложения.',
    en: 'The wallet holds less than what’s set aside in goals. Money may have been sent from another app.',
  },
  'home.shortfallFix': { ru: 'Пересчитать цели', en: 'Recalculate goals' },
  'home.balanceError': {
    ru: 'Не удалось получить баланс из сети Solana. Проверьте интернет или укажите свой RPC в настройках.',
    en: 'Couldn’t load the balance from Solana. Check your connection or set your own RPC in Settings.',
  },
  'home.deposit': { ru: 'Пополнить', en: 'Top up' },
  'home.withdraw': { ru: 'Вывести', en: 'Withdraw' },
  'home.swap': { ru: 'Обменять', en: 'Swap' },
  'home.allGoals': { ru: 'Все цели', en: 'All goals' },
  'home.wallet': { ru: 'Кошелёк', en: 'Wallet' },
  'home.refresh': { ru: 'Обновить', en: 'Refresh' },
  'home.refreshing': { ru: 'Обновляем…', en: 'Refreshing…' },
  'home.notOnDevnet': { ru: 'Нет в Devnet', en: 'Not on Devnet' },
  'home.tokenInGoals': { ru: 'в целях {amount}', en: '{amount} in goals' },

  // ---------------------------------------------------------------- goals
  'tpl.trip': { ru: 'Отпуск', en: 'Vacation' },
  'tpl.phone': { ru: 'Новый телефон', en: 'New phone' },
  'tpl.safety': { ru: 'Подушка безопасности', en: 'Emergency fund' },
  'tpl.laptop': { ru: 'Ноутбук', en: 'Laptop' },
  'tpl.gift': { ru: 'Подарок', en: 'Gift' },
  'tpl.car': { ru: 'Машина', en: 'Car' },
  'tpl.study': { ru: 'Учёба', en: 'Education' },

  'color.coin': { ru: 'Золото', en: 'Gold' },
  'color.mint': { ru: 'Мята', en: 'Mint' },
  'color.sky': { ru: 'Небо', en: 'Sky' },
  'color.berry': { ru: 'Ягода', en: 'Berry' },
  'color.plum': { ru: 'Слива', en: 'Plum' },
  'color.tangerine': { ru: 'Мандарин', en: 'Tangerine' },

  'goals.emptyTitle': { ru: 'Целей пока нет', en: 'No goals yet' },
  'goals.emptyText': {
    ru: 'Цель помогает копить: видно, сколько уже отложено и сколько осталось.',
    en: 'A goal makes saving easier: you see how much is set aside and how much is left.',
  },
  'goals.setGoal': { ru: 'Поставить цель', en: 'Set a goal' },
  'goals.ideas': { ru: 'Идеи для старта', en: 'Ideas to start with' },
  'goals.summary': { ru: 'отложено из {target} на {count}', en: 'saved of {target} across {count}' },
  'goals.saving': { ru: 'Копим', en: 'Saving up' },
  'goals.new': { ru: 'Новая цель', en: 'New goal' },
  'goals.done': { ru: 'Достигнуты', en: 'Reached' },
  'goals.goal': { ru: 'Цель', en: 'Goal' },
  'goals.deleted': { ru: 'Цель удалена', en: 'This goal was deleted' },
  'goals.edit': { ru: 'Изменить цель', en: 'Edit goal' },
  'goals.delete': { ru: 'Удалить цель', en: 'Delete goal' },
  'goals.of': { ru: 'из {target}', en: 'of {target}' },
  'goals.savedOf': { ru: '{saved} из {target}', en: '{saved} of {target}' },
  'goals.reached': { ru: 'Цель достигнута', en: 'Goal reached' },
  'goals.protected': { ru: 'Защищена до цели', en: 'Locked until reached' },
  'goals.lockOff': { ru: 'Замок снят', en: 'Lock is off' },
  'goals.progress': { ru: 'Прогресс', en: 'Progress' },
  'goals.left': { ru: 'Осталось', en: 'Left' },
  'goals.deadline': { ru: 'Срок', en: 'Deadline' },
  'goals.deadlinePassed': { ru: 'прошёл', en: 'passed' },
  'goals.noDeadline': { ru: 'без срока', en: 'none' },
  'goals.pace': {
    ru: ({ date, amount }) => (
      <>
        Чтобы успеть к {date}, откладывайте примерно <b>{amount}</b> в неделю.
      </>
    ),
    en: ({ date, amount }) => (
      <>
        To make it by {date}, put aside about <b>{amount}</b> a week.
      </>
    ),
  },
  'goals.paceDay': {
    ru: ({ date, amount }) => (
      <>
        Чтобы успеть к {date}, откладывайте примерно <b>{amount}</b> в день.
      </>
    ),
    en: ({ date, amount }) => (
      <>
        To make it by {date}, put aside about <b>{amount}</b> a day.
      </>
    ),
  },
  'milestone.25': { ru: 'Четверть пути к «{goal}»! 🎉', en: 'A quarter of the way to “{goal}”! 🎉' },
  'milestone.50': { ru: 'Половина «{goal}» уже в копилке! 🥳', en: 'Halfway to “{goal}”! 🥳' },
  'milestone.75': { ru: 'Три четверти «{goal}» — финиш близко! 🚀', en: 'Three quarters of “{goal}” — almost there! 🚀' },
  'goals.noDeadlineTile': { ru: 'без срока', en: 'no deadline' },
  'home.goalsProgress': { ru: 'Сколько уже собрано на все цели', en: 'How far along all goals are' },
  'goals.takeOut': { ru: 'Забрать', en: 'Take out' },
  'goals.inside': { ru: 'Что внутри', en: 'What’s inside' },
  'goals.history': { ru: 'История цели', en: 'Goal history' },
  'goals.historyEmpty': {
    ru: 'Здесь появятся пополнения цели. Нажмите «Отложить», чтобы положить первые деньги.',
    en: 'Money you add to this goal shows up here. Tap “Put aside” to add the first amount.',
  },
  'goals.added': { ru: 'Отложено', en: 'Added' },
  'goals.taken': { ru: 'Забрано', en: 'Taken out' },
  'goals.savedToast': { ru: 'Цель сохранена', en: 'Goal saved' },
  'goals.createdToast': { ru: 'Цель создана', en: 'Goal created' },
  'goals.namePlaceholder': { ru: 'Название цели', en: 'Goal name' },
  'goals.noAmount': { ru: 'Сумма не указана', en: 'No amount yet' },
  'goals.byDate': { ru: 'к {date}', en: 'by {date}' },
  'goals.whatFor': { ru: 'На что копим', en: 'What are you saving for' },
  'goals.namePh': { ru: 'Например, отпуск в Грузии', en: 'For example, a trip to Lisbon' },
  'goals.howMuch': { ru: 'Сколько нужно', en: 'How much you need' },
  'goals.usdHint': {
    ru: 'Цель считается в долларах: USDC и USDT идут один к одному, SOL — по текущему курсу.',
    en: 'Goals are counted in dollars: USDC and USDT count one to one, SOL at the current price.',
  },
  'goals.byWhen': { ru: 'К какой дате', en: 'By when' },
  'goals.noDeadlineChip': { ru: 'Без срока', en: 'No deadline' },
  'goals.months3': { ru: '3 месяца', en: '3 months' },
  'goals.months6': { ru: 'Полгода', en: '6 months' },
  'goals.year': { ru: 'Год', en: '1 year' },
  'goals.paceHint': {
    ru: 'Нужно откладывать примерно {amount} в неделю, {left}',
    en: 'You’ll need to put aside about {amount} a week, {left}',
  },
  'goals.paceHintDay': {
    ru: 'Нужно откладывать примерно {amount} в день, {left}',
    en: 'You’ll need to put aside about {amount} a day, {left}',
  },
  'goals.icon': { ru: 'Значок', en: 'Icon' },
  'goals.color': { ru: 'Цвет банки', en: 'Jar color' },
  'goals.lockTitle': { ru: 'Не трогать до цели', en: 'Lock until reached' },
  'goals.lockText': {
    ru: 'Забрать деньги или удалить цель получится, только когда она будет собрана. Отключить защиту потом нельзя.',
    en: 'You can take the money out or delete the goal only once it’s reached. The lock can’t be switched off later.',
  },
  'goals.lockWarn': {
    ru: 'Решение до конца цели: деньги останутся в банке, пока вы её не соберёте.',
    en: 'This holds until the goal is reached: the money stays in the jar until then.',
  },
  'goals.create': { ru: 'Создать цель', en: 'Create goal' },

  // ---------------------------------------------------------------- sheets
  'allocate.title': { ru: 'Отложить в цель', en: 'Put toward a goal' },
  'allocate.noGoals': {
    ru: 'Сначала поставьте цель — на отпуск, технику или подушку безопасности.',
    en: 'Set a goal first — a trip, a gadget or an emergency fund.',
  },
  'allocate.allAllocated': {
    ru: 'Все деньги уже разложены по целям. Пополните копилку, чтобы отложить ещё.',
    en: 'All your money is already in goals. Top up the piggy bank to put aside more.',
  },
  'allocate.empty': {
    ru: 'В копилке пока пусто. Пополните её USDC, USDT или SOL — и деньги можно будет отложить в цель.',
    en: 'The piggy bank is empty for now. Top it up with USDC, USDT or SOL, then put the money toward a goal.',
  },
  'allocate.done': { ru: 'Отложено {amount} в «{goal}»', en: '{amount} put toward “{goal}”' },
  'allocate.failed': {
    ru: 'Не получилось отложить: свободных денег меньше',
    en: 'Couldn’t put it aside: there’s less money available',
  },
  'allocate.whichGoal': { ru: 'В какую цель', en: 'Which goal' },
  'allocate.fromFree': { ru: 'Из свободных денег', en: 'From available money' },
  'allocate.onlyFree': { ru: 'Свободно только {amount}', en: 'Only {amount} available' },
  'allocate.willFill': { ru: 'Цель будет заполнена на {pct}%', en: 'The goal will be {pct}% full' },
  'allocate.willComplete': { ru: 'Цель будет заполнена на 100% — готово!', en: 'The goal will be 100% full — done!' },
  'allocate.toGoal': { ru: 'До цели: {amount}', en: 'To goal: {amount}' },
  'allocate.allFree': { ru: 'Всё свободное', en: 'All available' },
  'allocate.cta': { ru: 'Отложить {amount}', en: 'Put aside {amount}' },
  'allocate.note': {
    ru: 'Деньги остаются на вашем кошельке — копилка помечает их как отложенные на цель.',
    en: 'The money stays in your wallet — the piggy bank marks it as set aside for the goal.',
  },

  'guard.title': { ru: 'Цель защищена', en: 'This goal is locked' },
  'guard.text': {
    ru: 'Деньги из «{goal}» можно будет забрать, когда соберёте {target}. Так копилка помогает не потратить их раньше времени.',
    en: 'You can take the money out of “{goal}” once you reach {target}. That’s how the piggy bank helps you not spend it early.',
  },
  'guard.left': { ru: 'осталось {left}', en: '{left} to go' },
  'guard.yours': {
    ru: 'Деньги всё равно ваши и лежат на вашем кошельке: секретная фраза открывает его в любом кошельке Solana.',
    en: 'The money is still yours, in your own wallet: the recovery phrase opens it in any Solana wallet.',
  },
  'guard.addMore': { ru: 'Отложить ещё', en: 'Put more aside' },
  'guard.ok': { ru: 'Понятно', en: 'Got it' },

  'release.title': { ru: 'Забрать из «{goal}»', en: 'Take out of “{goal}”' },
  'release.done': { ru: '{amount} вернулись в свободные', en: '{amount} moved back to available' },
  'release.onlyInGoal': { ru: 'В цели только {amount}', en: 'Only {amount} in this goal' },
  'release.cta': { ru: 'Забрать {amount}', en: 'Take out {amount}' },
  'release.note': {
    ru: 'Деньги станут свободными: их можно вывести или отложить в другую цель.',
    en: 'The money becomes available: you can withdraw it or put it toward another goal.',
  },

  'done.title': { ru: 'Цель достигнута!', en: 'Goal reached!' },
  'done.text': {
    ru: 'На «{goal}» отложено {amount}. Можно тратить — или поставить новую цель.',
    en: 'You’ve saved {amount} for “{goal}”. Time to spend it — or set a new goal.',
  },
  'done.yay': { ru: 'Ура!', en: 'Hooray!' },
  'done.newGoal': { ru: 'Поставить новую цель', en: 'Set a new goal' },
  'done.lockOff': { ru: 'Замок снялся сам', en: 'The lock came off by itself' },
  'done.unlockedText': {
    ru: 'На «{goal}» отложено {amount}. Теперь деньги можно забрать — или оставить в цели.',
    en: 'You’ve saved {amount} for “{goal}”. You can take the money out now, or leave it where it is.',
  },
  'done.smartText': {
    ru: 'На «{goal}» собрано {amount}. Деньги лежат в смарт-контракте до {date} — потом их можно будет забрать.',
    en: 'You’ve saved {amount} for “{goal}”. The money stays in the smart contract until {date}, then you can take it out.',
  },
  'done.takeOut': { ru: 'Забрать деньги', en: 'Take the money out' },

  'delGoal.title': { ru: 'Удалить цель?', en: 'Delete this goal?' },
  'delGoal.text': {
    ru: 'Цель «{goal}» исчезнет, а отложенные в неё деньги станут свободными. С кошелька ничего не спишется.',
    en: '“{goal}” will disappear and the money in it becomes available. Nothing leaves your wallet.',
  },

  'forgot.text': {
    ru: 'Пароль хранится только у вас, поэтому сбросить его нельзя. Но копилку можно восстановить по секретной фразе (12 слов) или приватному ключу: удалите кошелёк из расширения и импортируйте его заново.',
    en: 'Only you know the password, so it can’t be reset. You can restore the piggy bank with your recovery phrase (12 words) or private key: remove the wallet from the extension and import it again.',
  },
  'forgot.warn': {
    ru: 'Без фразы или ключа деньги восстановить не получится. Цели и история на этом компьютере удалятся.',
    en: 'Without the phrase or key the money can’t be recovered. Goals and history on this computer will be erased.',
  },
  'forgot.reset': { ru: 'Удалить и восстановить', en: 'Remove and restore' },
  'forgot.remember': { ru: 'Я вспомню пароль', en: 'I’ll remember it' },

  'reset.title': { ru: 'Удалить кошелёк из расширения', en: 'Remove wallet from extension' },
  'reset.text': {
    ru: 'Ключи, цели и история удалятся с этого компьютера. Деньги останутся в сети Solana — вернуть доступ к ним можно только секретной фразой или приватным ключом.',
    en: 'Keys, goals and history will be erased from this computer. The money stays on Solana — only your recovery phrase or private key can bring back access to it.',
  },
  'reset.confirm': { ru: 'Чтобы подтвердить, введите слово «удалить»', en: 'To confirm, type “delete”' },
  'reset.word': { ru: 'удалить', en: 'delete' },
  'reset.cta': { ru: 'Удалить кошелёк', en: 'Remove wallet' },

  // ---------------------------------------------------------------- deposit
  'deposit.title': { ru: 'Пополнить копилку', en: 'Top up piggy bank' },
  'deposit.addrLabel': { ru: 'Адрес вашей копилки в сети Solana', en: 'Your piggy bank address on Solana' },
  'deposit.qrCopy': { ru: 'Нажмите, чтобы скопировать адрес', en: 'Click to copy the address' },
  'deposit.warn': {
    ru: () => (
      <>
        Принимаем только <b>SOL, USDC и USDT в сети Solana</b>. Если отправить через Ethereum, TRON или BSC — деньги не
        дойдут.
      </>
    ),
    en: () => (
      <>
        Only <b>SOL, USDC and USDT on the Solana network</b>. Money sent over Ethereum, TRON or BSC won’t arrive.
      </>
    ),
  },
  'deposit.testCoins': { ru: 'Тестовые монеты', en: 'Test coins' },
  'deposit.testText': {
    ru: 'Вы в Devnet: эти деньги ненастоящие, для проверки копилки.',
    en: 'You’re on Devnet: this money isn’t real, it’s for trying things out.',
  },
  'deposit.airdropOk': { ru: 'Пришёл 1 тестовый SOL', en: '1 test SOL arrived' },
  'deposit.airdropFail': {
    ru: 'Кран Devnet сейчас занят. Попробуйте позже или через faucet.solana.com',
    en: 'The Devnet faucet is busy. Try again later or use faucet.solana.com',
  },
  'deposit.requesting': { ru: 'Запрашиваем…', en: 'Requesting…' },
  'deposit.get1Sol': { ru: 'Получить 1 SOL', en: 'Get 1 SOL' },
  'deposit.testUsdc': { ru: 'Тестовые USDC', en: 'Test USDC' },
  'deposit.howExchange': { ru: 'Как пополнить с биржи', en: 'Top up from an exchange' },
  'deposit.ex1': {
    ru: 'На бирже откройте «Вывод» и выберите USDC, USDT или SOL.',
    en: 'On the exchange, open “Withdraw” and choose USDC, USDT or SOL.',
  },
  'deposit.ex2': {
    ru: () => (
      <>
        В поле «Сеть» выберите <b>Solana (SOL)</b>.
      </>
    ),
    en: () => (
      <>
        In the “Network” field, choose <b>Solana (SOL)</b>.
      </>
    ),
  },
  'deposit.ex3': {
    ru: 'Вставьте адрес копилки и проверьте первые и последние символы.',
    en: 'Paste the piggy bank address and check its first and last characters.',
  },
  'deposit.ex4': {
    ru: 'Подтвердите вывод. Деньги приходят за минуту, копилка покажет уведомление.',
    en: 'Confirm the withdrawal. Money arrives within a minute and the piggy bank will notify you.',
  },
  'deposit.howWallet': { ru: 'Как пополнить из другого кошелька', en: 'Top up from another wallet' },
  'deposit.w1': {
    ru: 'В Phantom, Solflare или другом кошельке Solana нажмите «Отправить».',
    en: 'In Phantom, Solflare or another Solana wallet, tap “Send”.',
  },
  'deposit.w2': { ru: 'Выберите токен и вставьте адрес копилки.', en: 'Pick the token and paste the piggy bank address.' },
  'deposit.w3': {
    ru: 'Для перевода нужна небольшая комиссия в SOL — около 0,00001 SOL.',
    en: 'The transfer needs a tiny fee in SOL — about 0.00001 SOL.',
  },
  'deposit.solscan': { ru: 'Открыть адрес в Solscan', en: 'Open address in Solscan' },

  // ---------------------------------------------------------------- send
  'send.badAddr': {
    ru: 'Это не адрес Solana. Проверьте, что скопировали его целиком.',
    en: 'This isn’t a Solana address. Make sure you copied all of it.',
  },
  'send.selfAddr': { ru: 'Это адрес вашей же копилки.', en: 'That’s your own piggy bank address.' },
  'send.wrongTokenAccount': {
    ru: 'Этот адрес — счёт другого токена, на него нельзя отправить {token}.',
    en: 'This address is an account for a different token, it can’t receive {token}.',
  },
  'send.offCurve': {
    ru: 'Это адрес программы, а не кошелька. Попросите у получателя адрес кошелька Solana.',
    en: 'This is a program address, not a wallet. Ask the recipient for their Solana wallet address.',
  },
  'send.cantSend': { ru: 'По этому адресу нельзя отправить токены.', en: 'Tokens can’t be sent to this address.' },
  'send.sent': { ru: 'Отправлено', en: 'Sent' },
  'send.sentToAddr': { ru: 'На адрес {to}', en: 'To {to}' },
  'send.notSent': { ru: 'Не отправлено', en: 'Not sent' },
  'send.signing': { ru: 'Подписываем…', en: 'Signing…' },
  'send.sending': { ru: 'Отправляем…', en: 'Sending…' },
  'send.preparing': { ru: 'Готовим транзакцию', en: 'Preparing the transaction' },
  'send.waiting': {
    ru: 'Ждём подтверждения сети. Обычно это пара секунд.',
    en: 'Waiting for the network to confirm. This usually takes a few seconds.',
  },
  'send.viewSolscan': { ru: 'Посмотреть в Solscan', en: 'View in Solscan' },
  'send.done': { ru: 'Готово', en: 'Done' },
  'send.canClose': {
    ru: 'Можно закрыть окно — перевод продолжится, статус появится в истории.',
    en: 'You can close this window — the transfer continues and its status shows in History.',
  },
  'send.reviewTitle': { ru: 'Проверьте перевод', en: 'Review transfer' },
  'send.recipient': { ru: 'Получатель', en: 'Recipient' },
  'send.network': { ru: 'Сеть', en: 'Network' },
  'send.fee': { ru: 'Комиссия сети', en: 'Network fee' },
  'send.ataFee': { ru: 'Счёт {token} для получателя', en: '{token} account for recipient' },
  'send.ataHint': {
    ru: 'Получатель ещё не принимал {token}. Сеть Solana берёт разовый депозит за открытие его счёта.',
    en: 'The recipient hasn’t received {token} before. Solana charges a one-time deposit to open their account.',
  },
  'send.tokenAccountWarn': {
    ru: 'Похоже, это адрес токен-счёта, а не кошелька. SOL на него лучше не отправлять.',
    en: 'This looks like a token account, not a wallet. Better not send SOL to it.',
  },
  'send.notEnoughSol': {
    ru: 'Не хватает SOL на комиссию: нужно {need} SOL, есть {have}. Пополните SOL.',
    en: 'Not enough SOL for fees: you need {need} SOL and have {have}. Top up SOL.',
  },
  'send.irreversible': {
    ru: 'Переводы в блокчейне нельзя отменить. Проверьте адрес ещё раз.',
    en: 'Blockchain transfers can’t be reversed. Check the address once more.',
  },
  'send.poisonTitle': {
    ru: 'Осторожно: похоже на подменённый адрес.',
    en: 'Careful: this may be a fake address.',
  },
  'send.poisonText': {
    ru: 'Начало и конец совпадают с адресом, который вы уже знаете, а середина другая. Мошенники подбирают такие адреса и присылают с них мелочь, чтобы адрес попал в вашу историю.',
    en: 'It starts and ends like an address you already know, but the middle is different. Scammers create look-alikes and send tiny amounts from them so they show up in your history.',
  },
  'send.poisonKnown': {
    ru: 'Знакомый адрес',
    en: 'The address you know',
  },
  'send.poisonNow': {
    ru: 'Адрес в переводе',
    en: 'The address in this transfer',
  },
  'send.dustTitle': {
    ru: 'Осторожно: с этого адреса вам приходила только мелочь.',
    en: 'Careful: this address has only ever sent you tiny amounts.',
  },
  'send.dustText': {
    ru: 'Так часто действуют мошенники. Отправляйте, только если точно знаете, чей это адрес.',
    en: 'That’s a common scam trick. Send only if you know for sure whose address it is.',
  },
  'send.ackAddr': {
    ru: 'Я сверил адрес целиком',
    en: 'I’ve checked the whole address',
  },
  'send.cta': { ru: 'Отправить {amount}', en: 'Send {amount}' },
  'send.edit': { ru: 'Изменить', en: 'Edit' },
  'send.what': { ru: 'Что отправить', en: 'What to send' },
  'send.to': { ru: 'Кому', en: 'To' },
  'send.toPh': { ru: 'Адрес кошелька Solana', en: 'Solana wallet address' },
  'send.paste': { ru: 'Вставить', en: 'Paste' },
  'send.howMuch': { ru: 'Сколько', en: 'Amount' },
  'send.canWithdraw': { ru: 'Можно вывести {amount}.', en: 'You can withdraw {amount}.' },
  'send.moreInGoals': { ru: 'Ещё {amount} отложено в целях —', en: '{amount} more is in goals —' },
  'send.takeFromGoal': { ru: 'сначала заберите из цели', en: 'take it out of the goal first' },
  'send.available': { ru: 'Доступно {amount}', en: '{amount} available' },
  'send.availableGoals': { ru: ', ещё {amount} отложено в целях', en: ', plus {amount} in goals' },
  'send.solReserve': { ru: '. Немного SOL остаётся на комиссии.', en: '. A little SOL stays behind for fees.' },
  'send.lowSol': {
    ru: 'Для перевода {token} нужно немного SOL на комиссию сети. Пополните копилку хотя бы на 0,003 SOL.',
    en: 'Sending {token} needs a little SOL for the network fee. Top up at least 0.003 SOL.',
  },
  'send.checking': { ru: 'Проверяем адрес…', en: 'Checking address…' },

  'err.sourceInsufficient': {
    ru: 'На одном токен-счёте недостаточно средств. Попробуйте меньшую сумму.',
    en: 'A single token account doesn’t hold enough. Try a smaller amount.',
  },
  'err.rent': {
    ru: 'Не хватает SOL на хранение счёта в сети. Пополните SOL хотя бы на 0,003.',
    en: 'Not enough SOL to keep the account on the network. Top up at least 0.003 SOL.',
  },
  'err.insufficient': {
    ru: 'Недостаточно средств. Проверьте сумму и что на кошельке есть SOL для комиссии.',
    en: 'Insufficient funds. Check the amount and that the wallet has SOL for fees.',
  },
  'err.expired': {
    ru: 'Сеть не успела принять транзакцию. Средства не списаны — попробуйте ещё раз.',
    en: 'The network didn’t accept the transaction in time. Nothing was charged — try again.',
  },
  'err.timeout': {
    ru: 'Сеть долго не отвечает. Проверьте статус в истории через минуту.',
    en: 'The network is slow to respond. Check the status in History in a minute.',
  },
  'err.txFailed': {
    ru: 'Сеть отклонила транзакцию — деньги не ушли, списана только комиссия сети.',
    en: 'The network rejected the transaction — the money didn’t move, only the network fee was charged.',
  },
  'err.network': {
    ru: 'Не удалось связаться с сетью Solana. Проверьте интернет или укажите свой RPC в настройках.',
    en: 'Couldn’t reach Solana. Check your connection or set your own RPC in Settings.',
  },
  'err.generic': { ru: 'Не получилось: {reason}', en: 'That didn’t work: {reason}' },

  // ---------------------------------------------------------------- swap
  'swap.title': { ru: 'Обмен', en: 'Swap' },
  'swap.pay': { ru: 'Отдаёте', en: 'You pay' },
  'swap.get': { ru: 'Получаете', en: 'You get' },
  'swap.available': { ru: 'Свободно {amount}', en: 'Free: {amount}' },
  'swap.after': { ru: 'уже за вычетом комиссии {pct}', en: 'after the {pct} fee' },
  'swap.flip': { ru: 'Поменять местами', en: 'Switch tokens' },
  'swap.refresh': { ru: 'Обновить курс', en: 'Refresh the rate' },
  'swap.rate': { ru: 'Курс', en: 'Rate' },
  'swap.fee': { ru: 'Комиссия PiggyBank, {pct}', en: 'PiggyBank fee, {pct}' },
  'swap.minOut': { ru: 'Получите минимум', en: 'Minimum received' },
  'swap.network': { ru: 'Комиссия сети', en: 'Network fee' },
  'swap.newAccount': { ru: 'Новый счёт {token} в сети', en: 'New {token} account' },
  'swap.impact': { ru: 'Влияние на цену', en: 'Price impact' },
  'swap.feeAccount': { ru: 'Открытие счёта для комиссии', en: 'Opening the fee account' },
  'swap.route': { ru: 'Маршрут', en: 'Route' },
  'swap.cta': { ru: 'Обменять', en: 'Swap' },
  'swap.quoting': { ru: 'Ищем лучший курс…', en: 'Finding the best rate…' },
  'swap.review': { ru: 'Проверьте обмен', en: 'Review the swap' },
  'swap.confirm': { ru: 'Обменять {amount} на {to}', en: 'Swap {amount} for {to}' },
  'swap.edit': { ru: 'Изменить', en: 'Edit' },
  'swap.reviewNote': {
    ru: 'Курс может немного сдвинуться за секунды. Если придёт меньше минимума (допуск {slippage}), сеть отменит обмен и деньги останутся у вас.',
    en: 'The rate can move a little within seconds. If less than the minimum would arrive (tolerance {slippage}), the network cancels the swap and your money stays with you.',
  },
  'swap.rateChangedNote': {
    ru: 'Курс изменился: теперь вы получите ≈ {amount}. Проверьте и подтвердите ещё раз.',
    en: 'The rate moved: you would now get ≈ {amount}. Check it and confirm again.',
  },
  'swap.feeNote': {
    ru: 'Обмен идёт через Jupiter. PiggyBank берёт {pct} от суммы — она показана до подтверждения.',
    en: 'Swaps go through Jupiter. PiggyBank keeps {pct} of the amount, shown before you confirm.',
  },
  'swap.needSol': {
    ru: 'Для обмена нужно {need} SOL свободными — на комиссию сети и временный счёт, — а сейчас {have}. Пополните SOL.',
    en: 'This swap needs {need} SOL free — for the network fee and a temporary account — and you have {have}. Top up SOL.',
  },
  'swap.solKept': {
    ru: 'Немного SOL остаётся на комиссию сети.',
    en: 'A little SOL stays back for the network fee.',
  },
  'swap.goalsKept': {
    ru: 'Ещё {amount} отложено в цели — эти деньги в обмене не участвуют.',
    en: '{amount} more is set aside in goals and isn’t used for swaps.',
  },
  'swap.min': { ru: 'Минимальная сумма обмена — {amount}.', en: 'The smallest swap is {amount}.' },
  'swap.mainnetTitle': { ru: 'Обмен работает в основной сети.', en: 'Swaps work on Mainnet.' },
  'swap.mainnetText': {
    ru: 'Сейчас выбрана тестовая сеть Devnet — переключить сеть можно в настройках.',
    en: 'You’re on the Devnet test network — switch networks in Settings.',
  },
  'swap.openSettings': { ru: 'Открыть настройки', en: 'Open Settings' },
  'swap.status.signing': { ru: 'Готовим обмен', en: 'Preparing the swap' },
  'swap.status.requoting': { ru: 'Обновляем курс', en: 'Refreshing the rate' },
  'swap.status.preparing': { ru: 'Проверяем курс и подписываем транзакцию.', en: 'Checking the rate and signing the transaction.' },
  'swap.status.sending': { ru: 'Меняем…', en: 'Swapping…' },
  'swap.status.waiting': { ru: 'Ждём подтверждения сети — обычно это пара секунд.', en: 'Waiting for the network — usually a couple of seconds.' },
  'swap.done': { ru: 'Обмен готов!', en: 'Swap complete!' },
  'swap.gave': { ru: 'Отдано {amount}, из них комиссия {fee}', en: 'Paid {amount}, including a {fee} fee' },
  'swap.again': { ru: 'Ещё обмен', en: 'Swap again' },
  'swap.canClose': {
    ru: 'Можно закрыть окно — обмен продолжится, результат появится в истории.',
    en: 'You can close the window — the swap carries on and shows up in History.',
  },
  'swap.failed': { ru: 'Обмен не прошёл', en: 'Swap failed' },
  'swap.err.mainnet': { ru: 'Обмен работает только в основной сети (Mainnet).', en: 'Swaps only work on Mainnet.' },
  'swap.err.tooSmall': { ru: 'Слишком маленькая сумма для обмена.', en: 'That amount is too small to swap.' },
  'swap.err.busy': {
    ru: 'Слишком много запросов курса подряд. Подождите несколько секунд и обновите.',
    en: 'Too many rate requests in a row. Wait a few seconds and refresh.',
  },
  'swap.err.noRoute': {
    ru: 'Сейчас не нашлось маршрута для такого обмена. Попробуйте другую сумму.',
    en: 'No route for this swap right now. Try another amount.',
  },
  'swap.err.unavailable': {
    ru: 'Сервис обмена сейчас не отвечает. Попробуйте чуть позже.',
    en: 'The swap service isn’t responding. Try again a little later.',
  },
  'swap.err.unsafe': {
    ru: 'Обмен остановлен: проверка показала, что транзакция делает не то, что обещано. Ничего не подписано, деньги на месте.',
    en: 'Swap stopped: the check showed the transaction doesn’t do what it promises. Nothing was signed, your money is untouched.',
  },
  'swap.err.badRate': {
    ru: 'Курс сильно отличается от рыночного, поэтому обмен не предлагаем. Попробуйте позже.',
    en: 'The rate is far from the market price, so we won’t offer this swap. Try again later.',
  },
  'swap.err.feeWallet': {
    ru: 'Обмен из SOL сейчас недоступен. Пока можно обменять USDC или USDT.',
    en: 'Swapping from SOL is unavailable right now. USDC and USDT can still be swapped.',
  },
  'swap.err.slippage': {
    ru: 'Курс сдвинулся сильнее допуска. Обновите курс и попробуйте снова.',
    en: 'The rate moved more than allowed. Refresh it and try again.',
  },
  'swap.err.sol': {
    ru: 'Не хватает SOL на комиссию сети. Пополните SOL хотя бы на 0,005.',
    en: 'Not enough SOL for the network fee. Top up at least 0.005 SOL.',
  },
  'swap.err.token': { ru: 'На счёте токена недостаточно средств для этой суммы.', en: 'The token account doesn’t hold enough for this amount.' },
  'swap.err.sim': {
    ru: 'Сеть не приняла бы этот обмен. Попробуйте другую сумму или обновите курс.',
    en: 'The network wouldn’t accept this swap. Try another amount or refresh the rate.',
  },
  'swap.err.rateChanged': { ru: 'Курс изменился — проверьте новую сумму.', en: 'The rate changed — check the new amount.' },

  // ---------------------------------------------------------------- history
  'history.transfers': { ru: 'Переводы', en: 'Transfers' },
  'history.refresh': { ru: 'Обновить историю', en: 'Refresh history' },
  'history.error': {
    ru: 'Не удалось загрузить переводы из сети. RPC мог ограничить запросы — попробуйте через минуту или укажите свой RPC в настройках.',
    en: 'Couldn’t load transfers. The RPC may be rate-limiting — try again in a minute or set your own RPC in Settings.',
  },
  'history.emptyTitle': { ru: 'Пока тихо', en: 'All quiet for now' },
  'history.emptyGoals': {
    ru: 'Здесь появятся действия с целями: что и куда вы отложили.',
    en: 'Goal activity shows up here: what you put aside and where.',
  },
  'history.emptyTransfers': {
    ru: 'Здесь появятся пополнения и выводы. Начните с пополнения копилки.',
    en: 'Top-ups and withdrawals show up here. Start by topping up the piggy bank.',
  },
  'history.pending': { ru: 'Отправляется', en: 'Sending' },
  'history.to': { ru: 'на {who}', en: 'to {who}' },
  'history.from': { ru: 'от {who}', en: 'from {who}' },
  'history.failed': { ru: 'Ошибка перевода', en: 'Failed transfer' },
  'history.in': { ru: 'Пополнение', en: 'Received' },
  'history.out': { ru: 'Вывод', en: 'Sent' },
  'history.locked': { ru: 'Заблокировано в смарт-контракте', en: 'Locked in smart contract' },
  'history.unlocked': { ru: 'Получено из смарт-контракта', en: 'Received from smart contract' },
  'history.openSolscan': { ru: 'Открыть в Solscan', en: 'Open in Solscan' },
  'history.allocate': { ru: 'Отложено в «{goal}»', en: 'Put toward “{goal}”' },
  'history.release': { ru: 'Забрано из «{goal}»', en: 'Taken out of “{goal}”' },
  'history.goalCreated': { ru: 'Новая цель «{goal}»', en: 'New goal “{goal}”' },
  'history.goalCompleted': { ru: 'Цель достигнута: «{goal}»', en: 'Goal reached: “{goal}”' },
  'history.lockGoal': { ru: 'Заблокировано для «{goal}»', en: 'Locked for “{goal}”' },
  'history.unlockGoal': { ru: 'Вернулось из контракта: «{goal}»', en: 'Back from the contract: “{goal}”' },
  'history.depositBack': { ru: 'Залог за хранение вернулся', en: 'Storage deposit refunded' },
  'history.spam': { ru: 'похоже на спам', en: 'likely spam' },
  'history.spamHint': {
    ru: 'Мелкие переводы с незнакомых адресов часто присылают мошенники. Не копируйте адрес из такой записи.',
    en: 'Tiny transfers from unknown addresses are often sent by scammers. Don’t copy the address from this entry.',
  },
  'history.swap': { ru: 'Обмен', en: 'Swap' },
  'history.swapFailed': { ru: 'Обмен не прошёл', en: 'Swap failed' },
  'history.swapPending': { ru: 'Обмен в процессе', en: 'Swapping' },
  'history.swapSub': { ru: '{from} → {to}', en: '{from} → {to}' },

  // ---------------------------------------------------------------- settings
  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.security': { ru: 'Безопасность', en: 'Security' },
  'settings.autolock': { ru: 'Автоблокировка', en: 'Auto-lock' },
  'settings.autolockHint': { ru: 'Попросит пароль после бездействия', en: 'Asks for the password after inactivity' },
  'settings.min5': { ru: '5 минут', en: '5 minutes' },
  'settings.min15': { ru: '15 минут', en: '15 minutes' },
  'settings.hour1': { ru: '1 час', en: '1 hour' },
  'settings.hour4': { ru: '4 часа', en: '4 hours' },
  'settings.never': { ru: 'Не блокировать', en: 'Never' },
  'settings.phraseAndKey': { ru: 'Секретная фраза и ключ', en: 'Recovery phrase and key' },
  'settings.showAfterPw': { ru: 'Показать после ввода пароля', en: 'Shown after entering the password' },
  'settings.notBackedUp': { ru: 'Фраза ещё не записана', en: 'Phrase not written down yet' },
  'settings.changePw': { ru: 'Сменить пароль', en: 'Change password' },
  'settings.devnetLabel': { ru: 'Devnet (тест)', en: 'Devnet (test)' },
  'settings.devnetHint': {
    ru: 'В Devnet монеты ненастоящие. Отложенные суммы для каждой сети считаются отдельно.',
    en: 'Devnet coins aren’t real. Each network keeps its own goal amounts.',
  },
  'settings.mainnetHint': { ru: 'Основная сеть Solana с настоящими деньгами.', en: 'The main Solana network with real money.' },
  'settings.rpc': { ru: 'RPC-адрес', en: 'RPC address' },
  'settings.rpcDefault': { ru: 'Публичные узлы Solana', en: 'Public Solana nodes' },
  'settings.rpcOwn': { ru: 'Ваш узел: {host}', en: 'Your node: {host}' },
  'settings.notifications': { ru: 'Уведомления', en: 'Notifications' },
  'settings.deposits': { ru: 'О пополнениях', en: 'Incoming money' },
  'settings.depositsHint': {
    ru: 'Сообщим, когда придут деньги. Меньше 1 USDC, 1 USDT или 0,01 SOL — обычно спам, о таком молчим',
    en: 'We’ll let you know when money arrives. Under 1 USDC, 1 USDT or 0.01 SOL is usually spam, so we stay quiet',
  },
  'settings.reminders': { ru: 'Напоминать откладывать', en: 'Saving reminders' },
  'settings.remindersHint': { ru: 'Вечером в 19:00', en: 'In the evening at 7 pm' },
  'settings.off': { ru: 'Выкл.', en: 'Off' },
  'settings.daily': { ru: 'Каждый день', en: 'Daily' },
  'settings.weekly': { ru: 'Раз в неделю', en: 'Weekly' },
  'settings.display': { ru: 'Экран', en: 'Display' },
  'settings.language': { ru: 'Язык', en: 'Language' },
  'settings.langAuto': { ru: 'Как в браузере', en: 'Same as browser' },
  'settings.hide': { ru: 'Скрывать суммы', en: 'Hide amounts' },
  'settings.hideHint': { ru: 'Удобно, если рядом кто-то есть', en: 'Handy when someone’s looking over your shoulder' },
  'settings.fromPhrase': { ru: 'Из секретной фразы, путь {path}', en: 'From recovery phrase, path {path}' },
  'settings.fromKey': { ru: 'Импортирован по приватному ключу', en: 'Imported from a private key' },
  'settings.about': {
    ru: 'PiggyBank — копилка на Solana, версия {version}. Ключи хранятся только в этом браузере, зашифрованные вашим паролем.',
    en: 'PiggyBank — a piggy bank on Solana, version {version}. Keys are stored only in this browser, encrypted with your password.',
  },

  'reveal.title': { ru: 'Секретные данные', en: 'Secret keys' },
  'reveal.backupTitle': { ru: 'Запишите фразу', en: 'Write down your phrase' },
  'reveal.warn': {
    ru: 'Кто знает фразу или ключ, тот распоряжается деньгами. Не показывайте их никому, в том числе «поддержке».',
    en: 'Anyone with the phrase or key controls the money. Never show them to anyone, including “support”.',
  },
  'reveal.password': { ru: 'Пароль от копилки', en: 'Piggy bank password' },
  'reveal.checking': { ru: 'Проверяем…', en: 'Checking…' },
  'reveal.show': { ru: 'Показать', en: 'Show' },
  'reveal.savedToast': { ru: 'Отлично, фраза сохранена', en: 'Great, your phrase is backed up' },
  'reveal.keyFormat': {
    ru: 'Формат base58 — подходит для импорта в Phantom, Solflare и Backpack.',
    en: 'Base58 format — works for importing into Phantom, Solflare and Backpack.',
  },
  'reveal.copyKey': { ru: 'Скопировать ключ', en: 'Copy key' },

  'changePw.done': { ru: 'Пароль изменён', en: 'Password changed' },
  'changePw.wrongOld': { ru: 'Текущий пароль не подходит', en: 'The current password is wrong' },
  'changePw.current': { ru: 'Текущий пароль', en: 'Current password' },
  'changePw.new': { ru: 'Новый пароль', en: 'New password' },
  'changePw.repeat': { ru: 'Повторите новый пароль', en: 'Repeat new password' },

  'rpc.title': { ru: 'RPC-адрес', en: 'RPC address' },
  'rpc.nowTitle': { ru: 'Через какие узлы идёт связь', en: 'Nodes the piggy bank talks to' },
  'rpc.inUse': { ru: 'сейчас', en: 'in use' },
  'rpc.yours': { ru: 'Ваш узел', en: 'Your node' },
  'rpc.ms': { ru: '{n} мс', en: '{n} ms' },
  'rpc.down': { ru: 'не отвечает', en: 'no answer' },
  'rpc.busy': { ru: 'занят', en: 'busy' },
  'rpc.otherNet': { ru: 'другая сеть', en: 'other network' },
  'rpc.check': { ru: 'Проверить связь', en: 'Check connection' },
  'rpc.checkingAll': { ru: 'Проверяем…', en: 'Checking…' },
  'rpc.autoSwitch': {
    ru: 'Узлы бесплатные и без ключей. Если один не отвечает или просит подождать, копилка сама переходит к следующему.',
    en: 'These nodes are free and need no keys. If one doesn’t answer or asks to slow down, the piggy bank moves on to the next.',
  },
  'rpc.ownTitle': { ru: 'Свой узел', en: 'Your own node' },
  'rpc.ownText': {
    ru: 'Публичные узлы иногда ограничивают число запросов. Узел с личным ключом работает быстрее и стабильнее — бесплатный ключ дают эти сервисы:',
    en: 'Public nodes sometimes limit how many requests they take. A node with your own key is faster and steadier — these services give a free key:',
  },
  'rpc.fallbackNote': { ru: 'Ваш узел будет первым, публичные останутся запасными.', en: 'Your node goes first; the public ones stay as a backup.' },
  'rpc.connect': { ru: 'Подключить', en: 'Connect' },
  'rpc.backToPublic': { ru: 'Вернуть публичные узлы', en: 'Back to public nodes' },
  'rpc.works': { ru: 'Узел работает, ответил за {ms} мс', en: 'The node works: answered in {ms} ms' },
  'rpc.clipboardEmpty': { ru: 'В буфере обмена пусто — скопируйте адрес узла', en: 'The clipboard is empty — copy the node address first' },
  'rpc.pasteManually': { ru: 'Вставьте адрес: Ctrl+V (⌘V на Mac)', en: 'Paste the address: Ctrl+V (⌘V on Mac)' },
  'rpc.label': { ru: 'Адрес для {net}', en: 'Address for {net}' },
  'rpc.resetToast': { ru: 'Снова через публичные узлы', en: 'Back on public nodes' },
  'rpc.needHttps': { ru: 'Нужен адрес вида https://…', en: 'The address must start with https://' },
  'rpc.checking': { ru: 'Проверяем узел…', en: 'Checking the node…' },
  'rpc.wrongNet': { ru: 'Этот узел не из сети {net}.', en: 'This node isn’t on {net}.' },
  'rpc.saved': { ru: 'Узел подключён', en: 'Node connected' },
  'rpc.noAnswer': { ru: 'Узел не отвечает: {reason}', en: 'The node doesn’t respond: {reason}' },

  // ---------------------------------------------------------------- theme
  'theme.title': { ru: 'Тема', en: 'Theme' },
  'theme.auto': { ru: 'Авто', en: 'Auto' },
  'theme.autoHint': { ru: 'Авто — как в системе: днём светлая, вечером тёмная, если так настроено.', en: 'Auto follows your system setting.' },
  'theme.light': { ru: 'Светлая', en: 'Light' },
  'theme.dark': { ru: 'Тёмная', en: 'Dark' },
  'theme.toDark': { ru: 'Включить тёмную тему', en: 'Switch to dark theme' },
  'theme.toLight': { ru: 'Включить светлую тему', en: 'Switch to light theme' },

  // ---------------------------------------------------------------- smart-contract lock
  'smart.title': { ru: 'Блокировка смарт-контрактом', en: 'Smart-contract lock' },
  'smart.subtitle': {
    ru: 'Деньги блокируются в блокчейне через Jupiter Lock',
    en: 'Money is locked on the blockchain with Jupiter Lock',
  },
  'smart.p1': {
    ru: 'Каждое пополнение цели уходит в смарт-контракт до {date}',
    en: 'Every top-up of this goal goes into a smart contract until {date}',
  },
  'smart.p1NoDate': { ru: 'Выберите дату разблокировки ниже', en: 'Pick the unlock date below' },
  'smart.p2': {
    ru: 'Раньше забрать нельзя никак — ни в копилке, ни через Phantom, ни через поддержку',
    en: 'There’s no way to take it out early — not here, not through Phantom, not through support',
  },
  'smart.p3': { ru: 'Блокируются USDC и USDT', en: 'Works with USDC and USDT' },
  'smart.p4': {
    ru: 'Комиссии за блокировку нет. Сеть берёт только залог ≈{sol} SOL за хранение — он вернётся, когда заберёте деньги',
    en: 'No lock fee. The network only holds a ≈{sol} SOL storage deposit, refunded when you take the money out',
  },
  'smart.p4Loading': { ru: 'Проверяем Jupiter Lock…', en: 'Checking Jupiter Lock…' },
  'smart.p4Unknown': {
    ru: 'Комиссии за блокировку нет — только небольшой возвратный залог в SOL. Точную сумму покажем перед подтверждением',
    en: 'No lock fee — only a small refundable SOL deposit. You’ll see the exact amount before confirming',
  },
  'smart.unavailable': {
    ru: 'Jupiter Lock недоступен в этой сети. Блокировка работает в Mainnet — переключите сеть в настройках.',
    en: 'Jupiter Lock isn’t available on this network. Locks work on Mainnet — switch the network in Settings.',
  },
  'smart.fixed': {
    ru: 'В контракте уже есть деньги этой цели, поэтому дату и режим изменить нельзя.',
    en: 'This goal already has money in the contract, so its date and mode can’t change.',
  },
  'smart.unlockDate': { ru: 'Дата разблокировки', en: 'Unlock date' },
  'smart.needDate': { ru: 'Выберите дату не раньше завтрашнего дня', en: 'Pick a date from tomorrow onwards' },
  'smart.badge': { ru: 'В смарт-контракте до {date}', en: 'Locked on-chain until {date}' },
  'smart.section': { ru: 'В смарт-контракте', en: 'In the smart contract' },
  'smart.badgeOpen': { ru: 'Смарт-контракт открылся {date}', en: 'Smart contract unlocked on {date}' },
  'smart.noLocks': {
    ru: 'Пока пусто. Нажмите «Заблокировать» — деньги уйдут в контракт до {date}.',
    en: 'Nothing here yet. Tap “Lock” to send money to the contract until {date}.',
  },
  'smart.closedNote': {
    ru: 'Дата разблокировки уже прошла — новые деньги в эту цель откладываются как обычно.',
    en: 'The unlock date has passed — new money for this goal is put aside the usual way.',
  },
  'smart.inWallet': { ru: 'В кошельке', en: 'In the wallet' },
  'smart.pending': { ru: 'Подтверждается в сети…', en: 'Confirming on the network…' },
  'smart.withdrawing': { ru: 'Возвращаем в кошелёк…', en: 'Moving back to the wallet…' },
  'smart.ready': { ru: 'Разблокировано — можно забрать', en: 'Unlocked — ready to take out' },
  'smart.until': { ru: 'откроется {date}, {left}', en: 'unlocks {date}, {left}' },
  'smart.withdraw': { ru: 'Забрать', en: 'Take out' },
  'smart.withdrawnToast': { ru: '{amount} вернулись в кошелёк', en: '{amount} is back in your wallet' },
  'smart.openStreamflow': { ru: 'Открыть в Streamflow', en: 'Open in Streamflow' },
  'smart.openExplorer': { ru: 'Открыть контракт в Solscan', en: 'View the contract on Solscan' },
  'smart.lockCta': { ru: 'Заблокировать', en: 'Lock' },
  'smart.lockedEntry': { ru: 'Заблокировано', en: 'Locked' },
  'smart.unlockedEntry': { ru: 'Разблокировано', en: 'Unlocked' },
  'smart.unlockedSub': { ru: 'в кошельке, в цели', en: 'back in the wallet, still in the goal' },
  'smart.sheetTitle': { ru: 'Заблокировать в смарт-контракте', en: 'Lock in a smart contract' },
  'smart.sheetLead': {
    ru: 'Деньги уйдут в смарт-контракт Jupiter Lock и откроются {date}. До этого их не достать.',
    en: 'The money goes into a Jupiter Lock smart contract and unlocks on {date}. Until then it can’t be touched.',
  },
  'smart.stablesOnly': { ru: 'В контракт можно положить USDC или USDT.', en: 'You can lock USDC or USDT.' },
  'smart.tooMuch': {
    ru: 'Свободно для блокировки: {amount}',
    en: 'Available to lock: {amount}',
  },
  'smart.qLocked': { ru: 'Заблокируется', en: 'Will be locked' },
  'smart.qFee': { ru: 'Комиссия протокола', en: 'Protocol fee' },
  'smart.noFee': { ru: 'нет', en: 'none' },
  'smart.qDeposit': { ru: 'Залог за хранение', en: 'Storage deposit' },
  'smart.qDepositSub': { ru: 'вернётся', en: 'refunded' },
  'smart.qNetwork': { ru: 'Комиссия сети', en: 'Network fee' },
  'smart.qTotal': { ru: 'Итого спишется', en: 'Total charged' },
  'smart.depositNote': {
    ru: 'Залог вернётся в кошелёк, когда вы заберёте деньги после {date}.',
    en: 'The deposit comes back to your wallet when you take the money out after {date}.',
  },
  'smart.quoteLoading': { ru: 'Проверяем Jupiter Lock…', en: 'Checking Jupiter Lock…' },
  'smart.quoteError': {
    ru: 'Не удалось связаться с Jupiter Lock. Проверьте интернет или RPC в настройках.',
    en: 'Couldn’t reach Jupiter Lock. Check your connection or the RPC in Settings.',
  },
  'smart.solShort': {
    ru: 'Не хватает SOL на залог и комиссию сети: нужно {need} SOL, свободно {have}. Пополните SOL.',
    en: 'Not enough SOL for the deposit and network fee: you need {need} SOL and have {have} available. Top up SOL.',
  },
  'smart.ack': {
    ru: 'Понимаю: до {date} эти деньги не достать — ни здесь, ни через другой кошелёк.',
    en: 'I understand this money can’t be taken out before {date} — not here, not with another wallet.',
  },
  'smart.preparing': { ru: 'Готовим контракт…', en: 'Preparing the contract…' },
  'smart.confirming': { ru: 'Ждём подтверждения сети…', en: 'Waiting for the network…' },
  'smart.lockUntil': { ru: 'Заблокировать до {date}', en: 'Lock until {date}' },
  'smart.footnote': {
    ru: 'Блокировку держит Jupiter Lock — открытый смарт-контракт Jupiter, проверенный аудиторами OtterSec и Sec3. Отмена и смена получателя отключены: ни копилка, ни Jupiter не могут забрать деньги раньше срока.',
    en: 'The lock is held by Jupiter Lock, Jupiter’s open-source smart contract audited by OtterSec and Sec3. Cancelling and changing the recipient are turned off: neither the piggy bank nor Jupiter can take the money out early.',
  },
  'smart.lockedToast': { ru: '{amount} заблокировано до {date}', en: '{amount} locked until {date}' },

  'home.shortfallFixed': { ru: 'Цели пересчитаны по фактическому балансу', en: 'Goals recalculated from the actual balance' },
  'home.smartContract': { ru: 'Смарт-контракт', en: 'Smart contract' },
  'home.lockedSub': { ru: 'заблокировано', en: 'locked' },
  'goals.cantLower': {
    ru: 'Цель защищена: сумму нельзя уменьшить ниже {target}',
    en: 'This goal is locked: the amount can’t go below {target}',
  },
  'goals.lockFixed': {
    ru: 'Защита снимется сама, когда цель будет собрана.',
    en: 'The lock comes off by itself once the goal is reached.',
  },
  'delGoal.hasLocks': {
    ru: 'В смарт-контракте ещё лежат деньги цели «{goal}». Удалить её можно после {date}, когда заберёте их.',
    en: '“{goal}” still has money in the smart contract. You can delete it after {date}, once you take the money out.',
  },
  'delGoal.protected': {
    ru: 'Цель «{goal}» защищена: удалить её можно, когда соберёте {target}.',
    en: '“{goal}” is locked: you can delete it once you reach {target}.',
  },

  'err.lockSol': {
    ru: 'Не хватает свободных SOL на залог и комиссию сети. Пополните SOL.',
    en: 'Not enough available SOL for the deposit and network fee. Top up SOL.',
  },
  'err.lockToken': {
    ru: 'Свободных денег меньше, чем вы хотите заблокировать.',
    en: 'There’s less available money than you want to lock.',
  },
  'err.lockClosed': {
    ru: 'Дата разблокировки этой цели прошла — новые блокировки недоступны.',
    en: 'This goal’s unlock date has passed — new locks aren’t available.',
  },
  'err.stillLocked': { ru: 'Деньги ещё заблокированы.', en: 'The money is still locked.' },
  'err.tokenUnavailable': { ru: 'Этот токен недоступен в текущей сети.', en: 'This token isn’t available on the current network.' },
  'err.hasLocks': {
    ru: 'У цели есть деньги в смарт-контракте — сначала заберите их.',
    en: 'This goal has money in the smart contract — take it out first.',
  },
  'allocate.solReserve': {
    ru: 'Немного SOL (0,002) всегда остаётся свободным — им платятся комиссии сети.',
    en: 'A little SOL (0.002) always stays available — it pays network fees.',
  },
  'send.clipboardEmpty': { ru: 'В буфере обмена пусто — скопируйте адрес', en: 'The clipboard is empty — copy the address first' },
  'send.pasteManually': { ru: 'Вставьте адрес: Ctrl+V (⌘V на Mac)', en: 'Paste the address: Ctrl+V (⌘V on Mac)' },
  'err.notEnoughFree': {
    ru: 'Свободных денег меньше: часть отложена в цели или ушла на комиссии. Обновите баланс.',
    en: 'There’s less available money: some is in goals or went on fees. Refresh the balance.',
  },
  'err.lockTooSmall': { ru: 'Сумма слишком маленькая для блокировки.', en: 'The amount is too small to lock.' },
  'err.lockProgramMissing': {
    ru: 'Jupiter Lock недоступен в этой сети. Переключитесь на Mainnet в настройках.',
    en: 'Jupiter Lock isn’t available on this network. Switch to Mainnet in Settings.',
  },
  'err.walletLocked': { ru: 'Копилка заблокирована. Откройте её паролем.', en: 'The piggy bank is locked. Unlock it with your password.' },
  'err.program': {
    ru: 'Смарт-контракт отклонил операцию. Средства не списаны.',
    en: 'The smart contract rejected the operation. Nothing was charged.',
  },
};
