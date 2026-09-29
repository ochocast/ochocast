import { test, expect } from '../fixtures';

test('create an event, publish it, and see it on the home page', async ({
  page,
  waitForCreatedEvent,
}) => {
  // Unique name: the test must not depend on (or break) existing data.
  const eventName = `E2E Event ${Date.now()}`;
  const tagName = `tag${Date.now()}`;

  await page.goto('/my-events/create');

  await page.getByTestId('event-name-input').fill(eventName);
  await page
    .getByTestId('event-description-input')
    .fill('E2E event description');
  await page.getByTestId('event-date-input').fill('2050-10-10');
  await page.getByTestId('event-start-time-input').fill('19:00');
  await page.getByTestId('event-end-time-input').fill('23:00');

  // Tags are created through the "+" button of the suggestion list.
  await page.getByPlaceholder('Tags').fill(tagName);
  await page
    .locator('#suggestions_list_suggestionTag button', { hasText: '+' })
    .click();

  const created = waitForCreatedEvent();
  await page.getByTestId('event-submit-button').click();
  await created;

  // The app redirects to "My events" where the event is still unpublished.
  await expect(page).toHaveURL(/\/my-events$/);
  const card = page.getByTestId('event-card').filter({ hasText: eventName });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('event-card-tag')).toHaveText(tagName);

  await card.getByRole('button', { name: 'Publish' }).click();

  // Published events appear on the home page.
  await page.goto('/');
  await expect(
    page.getByTestId('event-card').filter({ hasText: eventName }),
  ).toBeVisible();
});
