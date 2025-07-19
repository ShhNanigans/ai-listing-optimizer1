/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse, GroundingChunk, Type } from "@google/genai";

// --- Type Definitions ---
interface Recommendation {
  element: string;
  suggestion: string;
  reasoning: string;
}

interface WebSource {
    uri: string;
    title: string;
}

interface ListingAnalysis {
  overall_assessment: string;
  price_analysis?: string;
  recommendations: Recommendation[];
  suggested_keywords: string[];
  sources?: WebSource[];
}

interface ABTestVariation {
    title: string;
    description: string;
}

interface PromoContent {
    instagram_post: string;
    promotional_email: string;
}

interface FAQItem {
    question: string;
    answer: string;
}

// --- State & Constants ---
let currentAnalysis: ListingAnalysis | null = null;
let originalListing: string | null = null;
let currentFAQs: FAQItem[] | null = null;
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- UI Helpers ---
const setButtonLoading = (button: HTMLButtonElement, isLoading: boolean, defaultText: string) => {
  button.disabled = isLoading;
  const textEl = button.querySelector('.btn-text') as HTMLElement;
  if (isLoading) {
      textEl.textContent = 'Generating...';
      const loader = document.createElement('div');
      loader.className = 'loader';
      button.prepend(loader);
  } else {
      textEl.textContent = defaultText;
      button.querySelector('.loader')?.remove();
  }
};

const displayError = (message: string) => {
  const resultsContainer = document.getElementById('results-container');
  if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="error-message">${message}</div>`;
  }
};

const formatAIResponseWithAsterisks = (rawText: string): string => {
    if (!rawText) return '';
    const withBold = rawText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const paragraphs = withBold.split(/\n\s*(?=\*)/);
    const htmlParagraphs = paragraphs.map(p => {
        let content = p.trim();
        if (content.startsWith('*')) {
            content = content.substring(1).trim();
        }
        return `<p>${content.replace(/\n/g, '<br>')}</p>`;
    });
    return htmlParagraphs.join('');
};

const parseAnalysisFromText = (text: string): ListingAnalysis => {
    const analysis: ListingAnalysis = {
        overall_assessment: '',
        price_analysis: '',
        recommendations: [],
        suggested_keywords: [],
    };

    const assessmentMatch = text.match(/##\s*Overall Assessment\s*([\s\S]*?)(?=\n##|$)/);
    if (assessmentMatch) {
        analysis.overall_assessment = assessmentMatch[1].trim();
    }

    const priceMatch = text.match(/##\s*Price Analysis\s*([\s\S]*?)(?=\n##|$)/);
    if (priceMatch) {
        analysis.price_analysis = priceMatch[1].trim();
    }

    const tagsMatch = text.match(/##\s*Suggested SEO Tags \(13\)\s*([\s\S]*?)(?=\n##|$)/);
    if (tagsMatch) {
        analysis.suggested_keywords = tagsMatch[1]
            .split('\n')
            .map(kw => kw.replace(/^-/, '').trim())
            .filter(Boolean)
            .map(kw => kw.substring(0, 20));
    }

    const recommendationsBlockMatch = text.match(/##\s*Actionable Recommendations\s*([\s\S]*?)(?=\n##\s*Suggested SEO Tags|$)/);
    if (recommendationsBlockMatch) {
        const recommendationsText = recommendationsBlockMatch[1];
        const elementMatches = [...recommendationsText.matchAll(/^###\s*Element:\s*(.*)/gm)];
        elementMatches.forEach((match, index) => {
            const element = match[1].trim();
            const startIndex = match.index! + match[0].length;
            const nextMatch = elementMatches[index + 1];
            const endIndex = nextMatch ? nextMatch.index : recommendationsText.length;
            const chunk = recommendationsText.substring(startIndex, endIndex);
            const suggestionMatch = chunk.match(/####\s*Suggestion:\s*([\s\S]*?)(?=\n####\s*Reasoning:|$)/);
            const suggestion = suggestionMatch ? suggestionMatch[1].trim() : '';
            const reasoningMatch = chunk.match(/####\s*Reasoning:\s*([\s\S]*)/);
            const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';
            if (element && (suggestion || reasoning)) {
                analysis.recommendations.push({ element, suggestion, reasoning });
            }
        });
    }
    return analysis;
};

// --- UI Rendering ---

const renderApp = () => {
  const appContainer = document.getElementById('app-container');
  if (!appContainer) return;

  appContainer.innerHTML = `
    <h1>AI E-Commerce Listing Optimizer</h1>
    <p class="subtitle">Paste your product listing, get AI-powered improvement suggestions, and then generate marketing assets like A/B tests and promo copy.</p>

    <div class="input-container">
      <textarea id="listing-input" placeholder="Paste your full product listing here (title, description, features...)\n\ne.g.,\nTitle: Custom Wedding Welcome Sign\nDescription: A beautiful handmade sign to welcome guests to your special day. Made from wood."></textarea>

      <button id="generate-btn">
        <span class="btn-text">Analyze Listing</span>
      </button>
    </div>

    <div id="results-container" aria-live="polite"></div>
  `;
};

const displayResults = (analysis: ListingAnalysis) => {
    const resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) return;
    currentAnalysis = analysis;
    resultsContainer.innerHTML = '';

    const assessmentSection = document.createElement('div');
    assessmentSection.className = 'analysis-section';
    assessmentSection.innerHTML = `
        <div class="section-header"><h2>Overall Assessment</h2></div>
        <div class="formatted-ai-response">${formatAIResponseWithAsterisks(analysis.overall_assessment)}</div>
    `;
    resultsContainer.appendChild(assessmentSection);

    if (analysis.price_analysis) {
        const priceSection = document.createElement('div');
        priceSection.className = 'analysis-section';
        priceSection.innerHTML = `
            <div class="section-header"><h2>Price Analysis</h2></div>
            <div class="formatted-ai-response">${formatAIResponseWithAsterisks(analysis.price_analysis)}</div>
        `;
        resultsContainer.appendChild(priceSection);
    }

    if (analysis.recommendations.length > 0) {
        const recommendationsSection = document.createElement('div');
        recommendationsSection.className = 'analysis-section';
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<h2>Actionable Recommendations</h2>`;
        recommendationsSection.appendChild(header);
        const grid = document.createElement('div');
        grid.className = 'recommendations-grid';
        analysis.recommendations.forEach(rec => {
            const card = document.createElement('div');
            card.className = 'recommendation-card';
            const cardHeader = document.createElement('div');
            cardHeader.className = 'recommendation-header';
            const cardTitle = document.createElement('h4');
            cardTitle.innerHTML = `Recommendation for: <span>${rec.element}</span>`;
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(rec.suggestion).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                });
            });
            cardHeader.appendChild(cardTitle);
            cardHeader.appendChild(copyBtn);
            const cardBody = document.createElement('div');
            cardBody.className = 'recommendation-body';
            cardBody.innerHTML = `
                <p><strong>Suggestion:</strong></p>
                <div class="formatted-ai-response">${formatAIResponseWithAsterisks(rec.suggestion)}</div>
                <p><strong>Reasoning:</strong></p>
                <div class="formatted-ai-response">${formatAIResponseWithAsterisks(rec.reasoning)}</div>
            `;
            card.appendChild(cardHeader);
            card.appendChild(cardBody);
            grid.appendChild(card);
        });
        recommendationsSection.appendChild(grid);
        resultsContainer.appendChild(recommendationsSection);
    }

    const keywordsSection = document.createElement('div');
    keywordsSection.className = 'analysis-section';
    const keywordsHeader = document.createElement('div');
    keywordsHeader.className = 'section-header';
    keywordsHeader.innerHTML = `<h2>Suggested SEO Tags (13)</h2>`;
    const copyTagsBtn = document.createElement('button');
    copyTagsBtn.id = 'copy-tags-btn';
    copyTagsBtn.className = 'copy-btn';
    copyTagsBtn.textContent = 'Copy Tags';
    copyTagsBtn.addEventListener('click', () => {
      const tagsToCopy = analysis.suggested_keywords.join(', ');
      navigator.clipboard.writeText(tagsToCopy).then(() => {
        copyTagsBtn.textContent = 'Copied!';
        setTimeout(() => { copyTagsBtn.textContent = 'Copy Tags'; }, 2000);
      });
    });
    keywordsHeader.appendChild(copyTagsBtn);
    const keywordsContainer = document.createElement('div');
    keywordsContainer.className = 'keywords-container';
    keywordsContainer.innerHTML = analysis.suggested_keywords.map(kw => `<span class="keyword-tag">${kw}</span>`).join('');
    keywordsSection.appendChild(keywordsHeader);
    keywordsSection.appendChild(keywordsContainer);
    resultsContainer.appendChild(keywordsSection);

    const sourcesSection = document.createElement('div');
    sourcesSection.className = 'analysis-section';
    const sourcesHeader = document.createElement('div');
    sourcesHeader.className = 'section-header';
    sourcesHeader.innerHTML = `<h2>Sources Consulted</h2>`;
    const sourcesList = document.createElement('ul');
    sourcesList.className = 'sources-list';
    const sourcesHTML = analysis.sources && analysis.sources.length > 0
      ? analysis.sources.map(source => `
          <li class="source-item">
            <a href="${source.uri}" target="_blank" rel="noopener noreferrer">${source.title || source.uri}</a>
          </li>
        `).join('')
      : '<li>No external sources were cited for this analysis.</li>';
    sourcesList.innerHTML = sourcesHTML;
    sourcesSection.appendChild(sourcesHeader);
    sourcesSection.appendChild(sourcesList);
    resultsContainer.appendChild(sourcesSection);

    const nextStepsContainer = document.createElement('div');
    nextStepsContainer.id = 'next-steps-container';
    resultsContainer.appendChild(nextStepsContainer);

    const extraToolsResults = document.createElement('div');
    extraToolsResults.id = 'extra-tools-results';
    resultsContainer.appendChild(extraToolsResults);

    renderNextSteps();
}

const renderNextSteps = () => {
    const nextStepsContainer = document.getElementById('next-steps-container');
    if (!nextStepsContainer) return;
    nextStepsContainer.innerHTML = `
      <div class="analysis-section next-steps-header">
        <div class="section-header"><h2>Next Steps</h2></div>
        <p>Use your optimized listing to create marketing assets.</p>
        <div class="actions-container">
            <button id="ab-test-btn" class="action-btn"><span class="btn-text">Create A/B Tests</span></button>
            <button id="promo-btn" class="action-btn"><span class="btn-text">Draft Promo Content</span></button>
            <button id="faq-btn" class="action-btn"><span class="btn-text">Generate FAQs</span></button>
        </div>
      </div>
    `;
    document.getElementById('ab-test-btn')?.addEventListener('click', handleABTestGeneration);
    document.getElementById('promo-btn')?.addEventListener('click', handlePromoGeneration);
    document.getElementById('faq-btn')?.addEventListener('click', handleFAQGeneration);
}

const displayABTests = (variations: ABTestVariation[]) => {
    const container = document.getElementById('extra-tools-results');
    if(!container) return;
    const variationsHTML = variations.map((v, i) => `
        <div class="recommendation-card ab-test-card">
            <div class="recommendation-header"><h4>Variation ${i + 1}</h4></div>
            <div class="recommendation-body">
                <p><strong>Title:</strong> ${v.title}</p>
                <p><strong>Description:</strong></p>
                <div class="formatted-ai-response">${formatAIResponseWithAsterisks(v.description)}</div>
            </div>
        </div>`).join('');
    const abTestSection = document.createElement('div');
    abTestSection.className = 'analysis-section';
    abTestSection.innerHTML = `
        <div class="section-header"><h2>A/B Test Variations</h2></div>
        <p>Different versions of your title and description to test for higher conversion.</p>
        <div class="recommendations-grid">${variationsHTML}</div>`;
    container.prepend(abTestSection);
}

const displayPromoContent = (content: PromoContent) => {
    const container = document.getElementById('extra-tools-results');
    if(!container) return;
    const promoSection = document.createElement('div');
    promoSection.className = 'analysis-section';
    promoSection.innerHTML = `
        <div class="section-header"><h2>Promotional Content</h2></div>
        <p>Ready-to-use copy for your social media and email campaigns.</p>
        <div class="recommendations-grid">
            <div class="recommendation-card promo-card">
                <div class="recommendation-header">
                    <h4>Instagram Post</h4>
                    <button class="copy-btn" data-copy-target="instagram-copy">Copy</button>
                </div>
                <div class="recommendation-body"><pre id="instagram-copy">${content.instagram_post}</pre></div>
            </div>
            <div class="recommendation-card promo-card">
                <div class="recommendation-header">
                    <h4>Promotional Email</h4>
                    <button class="copy-btn" data-copy-target="email-copy">Copy</button>
                </div>
                <div class="recommendation-body"><pre id="email-copy">${content.promotional_email}</pre></div>
            </div>
        </div>`;
    container.prepend(promoSection);
    container.querySelectorAll('.promo-card .copy-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const btn = e.currentTarget as HTMLElement;
            const targetId = btn.dataset.copyTarget;
            if (targetId) {
                const textToCopy = document.getElementById(targetId)?.innerText;
                if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        btn.textContent = 'Copied!';
                        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                    });
                }
            }
        });
    });
}

const displayFAQs = (faqs: FAQItem[]) => {
    const container = document.getElementById('extra-tools-results');
    if(!container) return;
    currentFAQs = faqs;
    const faqItemsHTML = faqs.map((faq) => `
        <details class="faq-item">
            <summary class="faq-question">
                <span>${faq.question}</span>
                <button class="copy-btn" data-copy-text="${faq.answer.replace(/"/g, '&quot;')}">Copy Answer</button>
            </summary>
            <div class="faq-answer">
                 <div class="formatted-ai-response">${formatAIResponseWithAsterisks(faq.answer)}</div>
            </div>
        </details>`).join('');
    const faqSection = document.createElement('div');
    faqSection.className = 'analysis-section';
    faqSection.innerHTML = `
        <div class="section-header"><h2>Frequently Asked Questions</h2></div>
        <p>Address customer concerns upfront and improve your listing's SEO.</p>
        <div class="faq-container">${faqItemsHTML}</div>`;
    container.prepend(faqSection);
    faqSection.querySelectorAll('.faq-question .copy-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const btn = e.currentTarget as HTMLElement;
            const textToCopy = btn.dataset.copyText;
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = 'Copy Answer'; }, 2000);
                });
            }
        });
    });
}

// --- Action Handlers ---

const handleABTestGeneration = async (e: Event) => {
    if (!currentAnalysis || !originalListing) return;
    const button = e.currentTarget as HTMLButtonElement;
    setButtonLoading(button, true, 'Create A/B Tests');
    try {
        const prompt = `Based on the original product listing and the provided AI analysis, generate two distinct alternative options for the product's title and description for A/B testing purposes.

        Original Listing: "${originalListing}"
        AI Analysis: ${JSON.stringify(currentAnalysis, null, 2)}

        Return the response as a single JSON object with the key "variations" which is an array of objects. Each object should have a "title" and a "description" key.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        variations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ["title", "description"]
                            }
                        }
                    }
                }
            }
        });
        
        const result = JSON.parse(response.text);
        displayABTests(result.variations);
        button.style.display = 'none';
    } catch(error) {
        console.error("A/B test generation failed:", error);
        displayError('Sorry, there was an error generating A/B tests.');
    } finally {
        setButtonLoading(button, false, 'Create A/B Tests');
    }
};

const handlePromoGeneration = async (e: Event) => {
    if (!currentAnalysis) return;
    const button = e.currentTarget as HTMLButtonElement;
    setButtonLoading(button, true, 'Draft Promo Content');
    try {
        const optimizedTitle = currentAnalysis.recommendations.find(r => r.element === 'Title')?.suggestion;
        const optimizedDescription = currentAnalysis.recommendations.find(r => r.element === 'Description')?.suggestion;

        const prompt = `You are a social media and email marketing expert. Based on the following optimized product information, create promotional content.

        Product Title: "${optimizedTitle}"
        Product Description: "${optimizedDescription}"

        Generate a concise and engaging Instagram post (including hashtags) and a short, persuasive promotional email.
        Return the response as a single JSON object with keys "instagram_post" and "promotional_email".
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        instagram_post: { type: Type.STRING },
                        promotional_email: { type: Type.STRING }
                    },
                    required: ["instagram_post", "promotional_email"]
                }
            }
        });

        const result = JSON.parse(response.text);
        displayPromoContent(result);
        button.style.display = 'none';
    } catch(error) {
        console.error("Promo content generation failed:", error);
        displayError('Sorry, there was an error generating promotional content.');
    } finally {
        setButtonLoading(button, false, 'Draft Promo Content');
    }
};

const handleFAQGeneration = async (e: Event) => {
    if (!currentAnalysis) return;
    const button = e.currentTarget as HTMLButtonElement;
    setButtonLoading(button, true, 'Generate FAQs');
    try {
        const optimizedTitle = currentAnalysis.recommendations.find(r => r.element === 'Title')?.suggestion;
        const optimizedDescription = currentAnalysis.recommendations.find(r => r.element === 'Description')?.suggestion;

        const prompt = `You are an expert e-commerce copywriter. Based on the provided product information, generate a list of 3-5 frequently asked questions (FAQs) that a potential buyer might have. Provide a clear and concise answer for each question.

        Product Title: "${optimizedTitle}"
        Product Description: "${optimizedDescription}"

        Return the response as a single JSON object with the key "faqs" which is an array of objects. Each object should have a "question" and "answer" key.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faqs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    answer: { type: Type.STRING }
                                },
                                required: ["question", "answer"]
                            }
                        }
                    }
                }
            }
        });
        
        const result = JSON.parse(response.text);
        displayFAQs(result.faqs);
        button.style.display = 'none';
    } catch(error) {
        console.error("FAQ generation failed:", error);
        displayError('Sorry, there was an error generating FAQs.');
    } finally {
        setButtonLoading(button, false, 'Generate FAQs');
    }
};

// --- Main Application Logic ---

const main = () => {
  renderApp();
  const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
  const listingInput = document.getElementById('listing-input') as HTMLTextAreaElement;
  const resultsContainer = document.getElementById('results-container');
  const yearSpan = document.getElementById('year');
  if (!generateBtn || !listingInput || !resultsContainer || !yearSpan) {
    console.error('UI elements not found. App cannot start.');
    return;
  }
  yearSpan.textContent = new Date().getFullYear().toString();

  const handleInitialGeneration = async () => {
    originalListing = listingInput.value.trim();
    if (!originalListing) {
      displayError('Please paste your product listing to get started.');
      return;
    }
    setButtonLoading(generateBtn, true, 'Analyze Listing');
    if(resultsContainer) resultsContainer.innerHTML = '';

    try {
        const userPrompt = `Analyze the following e-commerce product listing. Use Google Search to find top-ranking, successful listings for similar products to inform your recommendations. The product is: ${originalListing}

        Format your response using the following structure with Markdown headings. Do not use JSON.

        ## Overall Assessment
        A brief, 2-3 sentence summary of the listing's strengths and primary areas for improvement, based on your search.

        ## Price Analysis
        Based on your search of competing products, provide a brief analysis of the market price for this type of item. Suggest a competitive price range.

        ## Actionable Recommendations
        For each recommendation, provide the following structure:
        ### Element: [The part of the listing to change, e.g., 'Title', 'Description']
        #### Suggestion:
        [The specific, rewritten text or change to make.]
        #### Reasoning:
        [Why this change is recommended, referencing SEO, customer psychology, or findings from your search.]

        Repeat the ###/#### structure for each recommendation. Make sure to include recommendations for at least 'Title' and 'Description'.

        ## Suggested SEO Tags (13)
        - A list of exactly 13 high-intent SEO tags, with each tag on a new line starting with a hyphen.
        - IMPORTANT: Each tag MUST be 20 characters or less.
        `;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                tools: [{googleSearch: {}}],
                systemInstruction: "You are an expert e-commerce and SEO strategist. Your goal is to analyze a user's product listing. Use the provided Google Search tool to find real-time data on competing products. Base your actionable recommendations on the search results to improve the listing's sales potential. Output your response using markdown headings as requested. Ensure all suggested SEO tags are 20 characters or less.",
                temperature: 0.5,
            }
        });

      const content = response.text;
      
      let sources: WebSource[] = [];
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
          sources = groundingMetadata.groundingChunks
              .map((chunk: GroundingChunk) => chunk.web)
              .filter((web): web is WebSource => web !== undefined);
      }

      if (content) {
        const analysis = parseAnalysisFromText(content);
        analysis.sources = sources;
        displayResults(analysis);
      } else {
        displayError('The AI returned an empty response. Please try again.');
      }
    } catch (error) {
      console.error('Initial generation failed:', error);
      displayError('An unexpected error occurred. Please check your API key and try again.');
    } finally {
      setButtonLoading(generateBtn, false, 'Analyze Listing');
    }
  };
  generateBtn.addEventListener('click', handleInitialGeneration);
};

main();