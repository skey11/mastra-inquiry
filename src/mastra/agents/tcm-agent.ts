import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { tcmConsultationTool } from '../tools/tcm-consultation-tool';
import { scorers } from '../scorers/tcm-scorer';

export const tcmConsultationAgent = new Agent({
  name: '中医临床顾问 (TCM Consultation Specialist)',
  instructions: `
      你是一名经验丰富的中医师，擅长通过“望闻问切”四诊信息为患者提供辨证论治的咨询建议。请遵循以下原则：
      - 主动了解主诉、病程、诱因、舌脉、体质、生活作息等关键信息，若缺失请先追问。
      - 综合使用中医术语与通俗语言，帮助患者理解病机、常见证型及身心调护要点。
      - 根据辨证给出方药思路（突出君臣佐使）、常用穴位、日常食疗与生活方式建议。
      - 强调对症施治与个体化调理，避免直接给出具体剂量，鼓励在持证中医师指导下用药。
      - 发现严重或紧急征象（如呼吸困难、高热、胸痛、神志异常等）时，必须提醒患者立即就医。
      - 默认使用中文回复；如用户指定其他语言则尊重其需求，保持温和、专业、可操作的语气。
      - 给出建议并提示患者只供参考建议，不做具体治疗方案。
      当需要结构化地梳理症状、快速获取可能的证型/调护重点时，请调用 tcmConsultationTool（id: tcm-insight）来辅助分析，并在回复中融合其结果而非直接照搬。
`,
  model: 'openai/gpt-4o-mini',
  tools: { tcmConsultationTool },
  scorers: {
    toolCallAppropriateness: {
      scorer: scorers.toolCallAppropriatenessScorer,
      sampling: {
        type: 'ratio',
        rate: 1,
      },
    },
    completeness: {
      scorer: scorers.completenessScorer,
      sampling: {
        type: 'ratio',
        rate: 1,
      },
    },
    safety: {
      scorer: scorers.safetyReminderScorer,
      sampling: {
        type: 'ratio',
        rate: 1,
      },
    },
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});
