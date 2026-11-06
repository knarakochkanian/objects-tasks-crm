export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '';
  if (/invalid login credentials/i.test(message))
    return 'Неверный email или пароль. Проверьте данные и попробуйте снова.';
  if (/email not confirmed/i.test(message))
    return 'Учётная запись ещё не подтверждена. Обратитесь к руководителю.';
  if (/rate limit|too many requests/i.test(message))
    return 'Слишком много попыток. Подождите немного и повторите.';
  if (/fetch|network|failed to|load failed/i.test(message))
    return 'Нет соединения с сервером. Проверьте подключение и повторите.';
  if (/[а-яё]/i.test(message)) return message;
  return 'Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.';
}
