import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const patientIntakeSchema = z.object({
  name: z.string().optional(),
  age: z.number().int().min(0).max(120).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  keySymptoms: z.string().describe('Primary complaints, symptom quality, affected regions'),
  onset: z.string().optional().describe('Onset time or triggers'),
  duration: z.string().optional(),
  tongue: z.string().optional(),
  pulse: z.string().optional(),
  medicalHistory: z.string().optional(),
  medications: z.string().optional(),
  lifestyle: z.string().optional().describe('Diet, sleep, work, and stress details'),
  emotionalState: z.string().optional(),
});

const structuredIntakeStep = createStep({
  id: 'structure-intake',
  description: 'Normalize the patient intake and surface missing diagnostic clues.',
  inputSchema: patientIntakeSchema,
  outputSchema: z.object({
    case: patientIntakeSchema,
    summary: z.string(),
    missingInfo: z.array(z.string()),
    lifestyleFlags: z.array(z.string()),
    riskIndicators: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Patient intake data not provided');
    }

    const missingInfo: string[] = [];
    if (!inputData.tongue) missingInfo.push('舌质/舌苔');
    if (!inputData.pulse) missingInfo.push('脉象');
    if (!inputData.duration) missingInfo.push('病程时长');
    if (!inputData.medicalHistory) missingInfo.push('重要既往史');

    const lifestyleFlags = extractLifestyleFlags(inputData.lifestyle || '');
    const riskIndicators = detectRiskIndicators(inputData.keySymptoms);

    const summaryParts = [
      inputData.name ? `患者：${inputData.name}` : '患者：未提供姓名',
      inputData.age ? `年龄：${inputData.age}` : null,
      inputData.sex ? `性别：${inputData.sex}` : null,
      `主诉：${inputData.keySymptoms}`,
      inputData.onset ? `起病：${inputData.onset}` : null,
      inputData.duration ? `病程：${inputData.duration}` : null,
      inputData.tongue ? `舌象：${inputData.tongue}` : null,
      inputData.pulse ? `脉象：${inputData.pulse}` : null,
      inputData.medicalHistory ? `既往史：${inputData.medicalHistory}` : null,
      inputData.medications ? `用药/过敏：${inputData.medications}` : null,
      inputData.lifestyle ? `生活方式：${inputData.lifestyle}` : null,
      inputData.emotionalState ? `情绪：${inputData.emotionalState}` : null,
    ].filter(Boolean);

    return {
      case: inputData,
      summary: summaryParts.join('；'),
      missingInfo,
      lifestyleFlags,
      riskIndicators,
    };
  },
});

const consultationStep = createStep({
  id: 'provide-consultation',
  description: 'Generate a TCM-style consultation summary with pattern differentiation and guidance.',
  inputSchema: z.object({
    case: patientIntakeSchema,
    summary: z.string(),
    missingInfo: z.array(z.string()),
    lifestyleFlags: z.array(z.string()),
    riskIndicators: z.array(z.string()),
  }),
  outputSchema: z.object({
    consultation: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Structured intake not found');
    }

    const agent = mastra?.getAgent('tcmConsultationAgent');
    if (!agent) {
      throw new Error('TCM consultation agent not registered');
    }

    const prompt = buildConsultationPrompt(inputData);
    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let consultation = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      consultation += chunk;
    }

    return { consultation };
  },
});

const tcmConsultationWorkflow = createWorkflow({
  id: 'tcm-consultation-workflow',
  inputSchema: patientIntakeSchema,
  outputSchema: z.object({
    consultation: z.string(),
  }),
})
  .then(structuredIntakeStep)
  .then(consultationStep);

tcmConsultationWorkflow.commit();

export { tcmConsultationWorkflow };

function extractLifestyleFlags(lifestyle: string): string[] {
  const flags: string[] = [];
  const lower = lifestyle.toLowerCase();
  if (!lifestyle) return flags;

  if (lower.includes('late') || lower.includes('熬夜')) flags.push('作息不规律');
  if (lower.includes('cold') || lower.includes('生冷')) flags.push('偏好生冷或寒凉饮食');
  if (lower.includes('spicy') || lower.includes('辛辣')) flags.push('辛辣/油腻摄入多');
  if (lower.includes('stress') || lower.includes('压力')) flags.push('情志压力偏大');
  if (lower.includes('sedentary') || lower.includes('久坐')) flags.push('久坐少动');

  return flags;
}

function detectRiskIndicators(keySymptoms: string): string[] {
  const text = keySymptoms.toLowerCase();
  const indicators: string[] = [];

  if (text.includes('chest pain') || keySymptoms.includes('胸痛')) {
    indicators.push('胸痛/胸闷');
  }
  if (text.includes('faint') || keySymptoms.includes('晕厥')) {
    indicators.push('晕厥或意识不清');
  }
  if (text.includes('difficulty breathing') || keySymptoms.includes('呼吸困难')) {
    indicators.push('呼吸困难');
  }
  if (text.includes('high fever') || keySymptoms.includes('高热')) {
    indicators.push('高热不退');
  }

  return indicators;
}

function buildConsultationPrompt(data: z.infer<typeof consultationStep.inputSchema>) {
  return `
你收到一份患者的初步问诊资料，请以资深中医师的身份给予咨询建议。

【病历摘要】
${data.summary}

【生活方式提示】
${data.lifestyleFlags.length ? data.lifestyleFlags.join('、') : '未提及明显不良习惯'}

【潜在风险征象】
${data.riskIndicators.length ? data.riskIndicators.join('、') : '暂未发现明显危险征象'}

【缺失信息】
${data.missingInfo.length ? data.missingInfo.join('、') : '关键诊断信息基本齐全'}

请输出结构化建议，模板如下：

📋 辨证要点
- 说明可能的1~2个证型、病位、病机及依据（引用症状/舌脉描述）

🪄 治则与方药思路
- 治法与调理原则
- 可借鉴的代表方或加减方向（说明目的，不给具体剂量）
- 常用中药材或成分，用中文名称

🎯 穴位与外治
- 推荐2~4个核心穴位，并标注功效或手法

🥗 生活与饮食调护
- 饮食、情志、作息、运动方面的可操作建议

⚠️ 安全提醒
- 若存在风险征象或缺失关键信息，明确提醒何时需要线下就医或完善检查

要求：
- 默认使用中文，语气温和、专业。
- 结合 tcm-insight 工具提供的内容，但需用自己的语言综合描述。
- 如信息不足以辨证，请说明需要补充的内容与临时调理建议。`;
}
