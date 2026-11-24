const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiApiKey = process.env.GEMINI_API_KEY || '';
let genAI = null;
if (geminiApiKey && geminiApiKey.trim() !== '') {
  try {
    genAI = new GoogleGenerativeAI(geminiApiKey.trim());
    console.log('[AI] Google Gemini API initialized successfully.');
  } catch (err) {
    console.warn('[AI] Could not initialize Google Generative AI:', err.message);
  }
} else {
  console.log('[AI] GEMINI_API_KEY not configured. Using verified backend context and rule-based natural language processor.');
}

/**
 * AI Queue Assistant (Customer-Facing, bilingual English/Hindi)
 * Strictly constrained to verified backend context
 */
async function generateQueueAssistantResponse({ userQuery, userContext, language = 'en' }) {
  const isHindi = language === 'hi' || /[\u0900-\u097F]/.test(userQuery);

  const systemContext = `
You are the official QueueLess AI Customer Queue Assistant.
You assist customers in managing their queues, understanding token statuses, estimated wait times, and choosing appropriate services.
RULES:
1. ONLY state facts from the provided VERIFIED USER & QUEUE CONTEXT below. NEVER hallucinate or invent tokens, numbers, or wait times.
2. If the user does not have an active token, politely guide them to select an organization and generate a digital token.
3. If the user asks in Hindi or requests Hindi, respond in clean, polite Hindi. Otherwise respond in English.
4. Keep responses concise, supportive, and helpful.

VERIFIED USER & QUEUE CONTEXT:
${JSON.stringify(userContext, null, 2)}
`;

  // If Gemini API is available, query Gemini model
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `${systemContext}\n\nCustomer Question: ${userQuery}\n\nAnswer:`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return {
        reply: response.text(),
        provider: 'gemini-1.5-flash',
        language: isHindi ? 'hi' : 'en'
      };
    } catch (err) {
      console.warn('[AI] Gemini API call failed, falling back to rule-based engine:', err.message);
    }
  }

  // Fallback Rule-Based Natural Language Generator (Strictly adheres to verified data)
  return generateRuleBasedCustomerResponse(userQuery, userContext, isHindi);
}

function generateRuleBasedCustomerResponse(query, ctx, isHindi) {
  const lower = query.toLowerCase();
  const activeTokens = ctx?.activeTokens || [];

  if (isHindi) {
    if (activeTokens.length > 0) {
      const t = activeTokens[0];
      if (lower.includes('status') || lower.includes('position') || lower.includes('कहाँ') || lower.includes('स्थिति') || lower.includes('नंबर')) {
        return {
          reply: `नमस्ते ${ctx.userName || 'उपयोगकर्ता'}! आपका टोकन नंबर **${t.token_number}** (${t.service_name}) वर्तमान में **${t.status.toUpperCase()}** स्थिति में है। आपकी कतार स्थिति **#${t.queue_position}** है और अनुमानित प्रतीक्षा समय लगभग **${t.estimated_wait_minutes} मिनट** है।`,
          provider: 'rule_based_engine',
          language: 'hi'
        };
      }
      if (lower.includes('wait') || lower.includes('time') || lower.includes('समय') || lower.includes('देर')) {
        return {
          reply: `टोकन **${t.token_number}** के लिए अनुमानित प्रतीक्षा समय लगभग **${t.estimated_wait_minutes} मिनट** है। आपके आगे ${Math.max(0, t.queue_position - 1)} लोग कतार में हैं।`,
          provider: 'rule_based_engine',
          language: 'hi'
        };
      }
    } else {
      if (lower.includes('token') || lower.includes('टोकन') || lower.includes('कतार') || lower.includes('queue')) {
        return {
          reply: `नमस्ते! वर्तमान में आपके पास कोई सक्रिय टोकन नहीं है। आप 'Organizations' पेज पर जाकर अपने पसंदीदा अस्पताल, बैंक या कॉलेज की शाखा चुनकर नया डिजिटल टोकन ले सकते हैं।`,
          provider: 'rule_based_engine',
          language: 'hi'
        };
      }
    }

    return {
      reply: `QueueLess AI सहायता में आपका स्वागत है! मैं आपकी कतार स्थिति, टोकन नंबर और सेवा चुनने में सहायता कर सकता हूँ। आप अपना टोकन विवरण देख सकते हैं या डिजिटल टोकन बना सकते हैं।`,
      provider: 'rule_based_engine',
      language: 'hi'
    };
  }

  // English rule-based responses
  if (activeTokens.length > 0) {
    const t = activeTokens[0];
    if (lower.includes('status') || lower.includes('position') || lower.includes('where') || lower.includes('token')) {
      return {
        reply: `Hello ${ctx.userName || 'there'}! Your active token is **${t.token_number}** for **${t.service_name}** at ${t.branch_name}. Status: **${t.status.toUpperCase()}**. You are currently **#${t.queue_position}** in line with an estimated wait time of **~${t.estimated_wait_minutes} minutes** (${Math.max(0, t.queue_position - 1)} people ahead).`,
        provider: 'rule_based_engine',
        language: 'en'
      };
    }
    if (lower.includes('wait') || lower.includes('time') || lower.includes('long') || lower.includes('when')) {
      return {
        reply: `The estimated wait time for token **${t.token_number}** is **${t.estimated_wait_minutes} minutes**. Note: This is a transparent rule-based calculation based on active counters (${t.avg_service_duration_min || 15} min average per person).`,
        provider: 'rule_based_engine',
        language: 'en'
      };
    }
    if (lower.includes('cancel')) {
      return {
        reply: `You can cancel token **${t.token_number}** directly from your user dashboard or token details page by clicking the 'Cancel Token' button.`,
        provider: 'rule_based_engine',
        language: 'en'
      };
    }
  } else {
    if (lower.includes('token') || lower.includes('queue') || lower.includes('join')) {
      return {
        reply: `You do not have any active queue tokens right now. You can browse organizations, select a service (such as General OPD or Cash Deposit), and generate a real digital token instantly!`,
        provider: 'rule_based_engine',
        language: 'en'
      };
    }
  }

  return {
    reply: `Welcome to QueueLess AI! I can help you check your live queue position, estimated waiting time, explain token rules, or assist you in picking an organization service. How can I help you today?`,
    provider: 'rule_based_engine',
    language: 'en'
  };
}

/**
 * AI Admin Assistant (Organization Administrator Facing)
 * Answers analytical questions strictly using authorized MySQL metrics summaries
 */
async function generateAdminAssistantResponse({ adminQuery, metricsContext, orgName }) {
  const systemContext = `
You are the official QueueLess AI Executive Admin Analyst for ${orgName}.
You analyze queue performance, counter utilization, token throughput, and service wait times for organization management.
RULES:
1. ONLY utilize the provided VERIFIED MYSQL METRICS DATA. NEVER fabricate or guess statistics.
2. If metrics show 0 or no activity, state that fact honestly.
3. Be professional, data-driven, and actionable. Provide recommendations based on bottleneck services.

VERIFIED MYSQL METRICS DATA:
${JSON.stringify(metricsContext, null, 2)}
`;

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `${systemContext}\n\nAdministrator Question: ${adminQuery}\n\nExecutive Analytical Response:`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return {
        reply: response.text(),
        provider: 'gemini-1.5-flash'
      };
    } catch (err) {
      console.warn('[AI] Gemini API admin call failed, falling back to rule-based engine:', err.message);
    }
  }

  // Fallback Analytical Rule Engine
  return generateRuleBasedAdminResponse(adminQuery, metricsContext, orgName);
}

function generateRuleBasedAdminResponse(query, metrics, orgName) {
  const lower = query.toLowerCase();
  const summary = metrics.summary || {};
  const totalTokens = summary.totalTokens || 0;
  const completed = summary.completedTokens || 0;
  const waiting = summary.waitingTokens || 0;
  const avgWait = summary.avgWaitTimeMinutes || 0;
  const noShowRate = summary.noShowRatePercent || 0;

  if (lower.includes('served') || lower.includes('completed') || lower.includes('how many')) {
    return {
      reply: `For **${orgName}**, a total of **${completed}** customers have been successfully served today (out of **${totalTokens}** total tokens generated). Currently, there are **${waiting}** customers waiting in active queues.`,
      provider: 'rule_based_engine'
    };
  }

  if (lower.includes('longest') || lower.includes('queue') || lower.includes('bottleneck') || lower.includes('service')) {
    const services = metrics.serviceStats || [];
    if (services.length > 0) {
      const longest = [...services].sort((a, b) => (b.waiting_count || 0) - (a.waiting_count || 0))[0];
      return {
        reply: `The service with the largest active queue is **${longest.service_name}** with **${longest.waiting_count || 0} waiting tokens** (average duration: ${longest.avg_service_duration_min || 15} mins). Consider opening an additional counter for this desk.`,
        provider: 'rule_based_engine'
      };
    }
  }

  if (lower.includes('wait') || lower.includes('average') || lower.includes('performance') || lower.includes('summary')) {
    return {
      reply: `**${orgName} Today's Performance Summary:**\n- **Total Tokens**: ${totalTokens}\n- **Served**: ${completed}\n- **Waiting**: ${waiting}\n- **Average Wait Time**: ~${avgWait} mins\n- **No-Show Rate**: ${noShowRate}%\nOperational efficiency is stable with active counter monitoring.`,
      provider: 'rule_based_engine'
    };
  }

  return {
    reply: `Summary for **${orgName}**: Total tokens generated: **${totalTokens}**, Completed: **${completed}**, Currently Waiting: **${waiting}**, Average Wait Time: **${avgWait} min**. Counter utilization is active across all configured branches.`,
    provider: 'rule_based_engine'
  };
}

module.exports = {
  generateQueueAssistantResponse,
  generateAdminAssistantResponse
};
