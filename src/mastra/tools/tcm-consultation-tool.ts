import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

type TcmPattern = {
  id: string;
  name: string;
  description: string;
  classicalFormula: string;
  keyHerbs: string[];
  acupoints: string[];
  lifestyle: string[];
  keywords: string[];
};

const tcmPatterns: TcmPattern[] = [
  {
    id: 'windCold',
    name: '风寒束表 (Wind-Cold Invasion)',
    description: 'Aversion to wind/cold with superficial obstruction, often early-stage external pathogen.',
    classicalFormula: '荆防败毒散 或 桂枝汤加减',
    keyHerbs: ['荆芥', '防风', '桂枝', '白芍', '薄荷'],
    acupoints: ['LI4 合谷', 'LU7 列缺', 'GB20 风池', 'DU14 大椎'],
    lifestyle: ['保暖避风，避免冷饮', '多饮温姜茶或葱白水', '充分休息，避免汗出过多'],
    keywords: [
      'chill',
      'chills',
      'aversion to wind',
      'stiff neck',
      'body ache',
      '无汗',
      '恶寒',
      '头痛',
      'clear mucus',
      'sneezing',
    ],
  },
  {
    id: 'windHeat',
    name: '风热犯表 (Wind-Heat Invasion)',
    description: 'Heat signs with sore throat, thirst, or yellow nasal discharge.',
    classicalFormula: '银翘散 或 桑菊饮',
    keyHerbs: ['金银花', '连翘', '桑叶', '菊花', '薄荷'],
    acupoints: ['LI4 合谷', 'LI11 曲池', 'LU10 鱼际', 'DU14 大椎'],
    lifestyle: ['多饮温水，可用菊花薄荷茶缓解', '避免辛辣炸物与酒精', '保持充足睡眠，利于正气恢复'],
    keywords: [
      'sore throat',
      'throat pain',
      'red eyes',
      'yellow mucus',
      'fever',
      '发热',
      '咽喉痛',
      '咽痛',
      '口渴',
    ],
  },
  {
    id: 'qiDeficiency',
    name: '脾肺气虚 (Spleen/Lung Qi Deficiency)',
    description: 'Fatigue, low voice, tendency to catch colds, loose stools, spontaneous sweating.',
    classicalFormula: '玉屏风散 或 补中益气汤',
    keyHerbs: ['黄芪', '白术', '防风', '党参', '陈皮'],
    acupoints: ['ST36 足三里', 'RN6 气海', 'RN12 中脘', 'BL13 肺俞'],
    lifestyle: ['规律进餐，温食为主', '适度运动如太极或散步', '避免过劳，保持情绪平稳'],
    keywords: [
      'fatigue',
      'low appetite',
      'loose stool',
      'spontaneous sweat',
      'tired',
      '乏力',
      '食欲差',
      '大便稀',
      '怕风',
    ],
  },
  {
    id: 'liverQiStagnation',
    name: '肝气郁结 (Liver Qi Stagnation)',
    description: 'Stress-related distention, mood swings, PMS, sighing.',
    classicalFormula: '逍遥散 或 柴胡疏肝散',
    keyHerbs: ['柴胡', '白芍', '香附', '薄荷', '炙甘草'],
    acupoints: ['LR3 太冲', 'PC6 内关', 'GB34 阳陵泉', 'RN17 膻中'],
    lifestyle: ['深呼吸练习或八段锦', '保持情绪抒发，可写日记或与人交流', '减少油腻与酒精摄入'],
    keywords: ['stress', 'irritability', 'pms', 'distention', '胀痛', '情绪', '胸闷', ' sigh '],
  },
];

const redFlagIndicators = [
  {
    keywords: ['difficulty breathing', '喘不过气', 'chest pain', '晕厥', '意识模糊'],
    message: '出现呼吸困难、胸痛或意识改变，应立即就医或拨打急救电话。',
  },
  {
    keywords: ['high fever', '39', 'persistent vomiting', '呕血', '血便'],
    message: '持续高热或伴有出血、剧烈呕吐需及时到医院排查严重感染或内科问题。',
  },
];

const intakeSchema = z.object({
  keySymptoms: z.string().describe('Primary symptoms and their progression'),
  tongue: z.string().optional().describe('Tongue body or coating observations'),
  pulse: z.string().optional().describe('Pulse qualities if available'),
  constitution: z.string().optional().describe('Known constitution or chronic tendencies'),
  lifestyle: z.string().optional().describe('Sleep, diet, stress, and work patterns'),
  duration: z.string().optional().describe('Symptom duration or triggers'),
});

const patternSchema = z.object({
  name: z.string(),
  description: z.string(),
  rationale: z.string(),
  classicalFormula: z.string(),
  keyHerbs: z.array(z.string()),
  acupoints: z.array(z.string()),
  lifestyle: z.array(z.string()),
});

type Intake = z.infer<typeof intakeSchema>;

export const tcmConsultationTool = createTool({
  id: 'tcm-insight',
  description: 'Analyze patient presentation to surface likely TCM patterns, red flags, and care focuses.',
  inputSchema: intakeSchema,
  outputSchema: z.object({
    primaryPattern: patternSchema,
    secondaryPatterns: z.array(patternSchema).describe('Other relevant patterns to rule in/out'),
    redFlags: z.array(z.string()),
    intakeSummary: z.string(),
    suggestedFocus: z.array(z.string()),
  }),
  execute: async ({ context }) => analyzePresentation(context as Intake),
});

function analyzePresentation(context: Intake) {
  const narrativeParts = [
    context.keySymptoms,
    context.duration,
    context.tongue,
    context.pulse,
    context.constitution,
    context.lifestyle,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = tcmPatterns
    .map((pattern) => ({
      pattern,
      score: pattern.keywords.reduce((acc, keyword) => {
        return narrativeParts.includes(keyword.toLowerCase()) ? acc + 1 : acc;
      }, 0),
    }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0]?.score
    ? buildPattern(scored[0].pattern, context)
    : buildGeneralWellnessPattern(context);

  const secondaryPatterns = scored
    .slice(1, 3)
    .filter((item) => item.score > 0)
    .map((item) => buildPattern(item.pattern, context));

  const redFlags = redFlagIndicators
    .filter((indicator) =>
      indicator.keywords.some((keyword) => narrativeParts.includes(keyword.toLowerCase())),
    )
    .map((indicator) => indicator.message);

  const suggestedFocus = Array.from(
    new Set([...primary.lifestyle, ...secondaryPatterns.flatMap((p) => p.lifestyle)]),
  ).slice(0, 5);

  const intakeSummary = [
    `主诉：${context.keySymptoms}`,
    context.duration ? `病程：${context.duration}` : null,
    context.tongue ? `舌象：${context.tongue}` : null,
    context.pulse ? `脉象：${context.pulse}` : null,
    context.constitution ? `体质：${context.constitution}` : null,
    context.lifestyle ? `生活方式：${context.lifestyle}` : null,
  ]
    .filter(Boolean)
    .join('；');

  return {
    primaryPattern: primary,
    secondaryPatterns,
    redFlags,
    intakeSummary,
    suggestedFocus,
  };
}

function buildPattern(pattern: TcmPattern, context: Intake) {
  return {
    name: pattern.name,
    description: pattern.description,
    classicalFormula: pattern.classicalFormula,
    keyHerbs: pattern.keyHerbs,
    acupoints: pattern.acupoints,
    lifestyle: pattern.lifestyle,
    rationale: `根据提供的症状（${context.keySymptoms}）及体征提示的关键词，符合${pattern.name}的特征表现。`,
  };
}

function buildGeneralWellnessPattern(context: Intake) {
  return {
    name: '一般调理 (General Regulation)',
    description: '未出现典型辨证线索，以扶正祛邪、调和脏腑为主的综合调理建议。',
    classicalFormula: '可依体质选择四君子汤、六味地黄丸等基础方加减',
    keyHerbs: ['黄芪', '党参', '茯苓', '白术', '麦冬'],
    acupoints: ['ST36 足三里', 'RN6 气海', 'SP6 三阴交'],
    lifestyle: ['保证睡眠，规律饮食', '适量温和运动，保持情绪稳定'],
    rationale: `目前症状描述（${context.keySymptoms}）尚不足以判定特定证型，建议先行综合调理并随访。`,
  };
}
