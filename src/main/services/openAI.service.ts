import { OpenAI } from 'openai';
import {
  EnhanceModelResponseType,
  GenerateDashboardResponseType,
} from '../../types/backend';

export default class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
    });
  }

  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      tools: [
        {
          type: 'function',
          function: {
            name: 'suggestDashboard',
            description:
              'Suggests multiple dashboards based on a dbt model and provides a related SQL query for each.',
            parameters: {
              type: 'object',
              properties: {
                dashboards: {
                  type: 'array',
                  description: 'List of suggested dashboards',
                  items: {
                    type: 'object',
                    properties: {
                      description: {
                        type: 'string',
                        description:
                          'A human-readable dashboard description based on the dbt model',
                      },
                      query: {
                        type: 'string',
                        description:
                          'A useful SQL query or dbt select statement for that dashboard',
                      },
                    },
                    required: ['description', 'query'],
                  },
                },
              },
              required: ['dashboards'],
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'suggestDashboard' },
      },
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    const parsed = JSON.parse(toolCall?.function.arguments || '{}');
    return parsed.dashboards || [];
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      tools: [
        {
          type: 'function',
          function: {
            name: 'enhanceSqlModel',
            description:
              'Replaces placeholders in a dbt model with real column names.',
            parameters: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description:
                    'The updated SQL with placeholders replaced appropriately',
                },
              },
              required: ['content'],
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'enhanceSqlModel' },
      },
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    const parsed = JSON.parse(toolCall?.function.arguments || '{}');
    return { content: parsed.content };
  }
}
