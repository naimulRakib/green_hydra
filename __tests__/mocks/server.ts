import { setupServer } from 'msw/node'
import { geminiHandlers } from './handlers/gemini'
import { openMeteoHandlers } from './handlers/openMeteo'
import { isricHandlers } from './handlers/isric'

// Set up MSW mock server with all API handlers
export const server = setupServer(
  ...geminiHandlers,
  ...openMeteoHandlers,
  ...isricHandlers
)
