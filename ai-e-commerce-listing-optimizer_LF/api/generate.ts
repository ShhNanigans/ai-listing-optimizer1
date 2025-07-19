
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, GroundingChunk } from "@google/genai";

// This is a generic type for a serverless function request, compatible with Vercel, Netlify, etc.
// In a real project, you might import specific types from your deployment platform.
interface ServerlessRequest {
    method: string;
    json: () => Promise<{ listing: string }>;
}

interface WebSource {
    uri: string;
    title: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// This function signature is compatible with Vercel's edge functions.
export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { listing } = await req.json();

        if (!listing) {
            return new Response('Missing product listing in request body.', { status: 400 });
        }
        
        const userPrompt = `Analyze the following e-commerce product listing. Use Google Search to find top-ranking, successful listings for similar products to inform your recommendations. The product is: ${listing}

        Format your response using the following structure with Markdown headings. Do not use JSON.

        ## Overall Assessment
        A brief, 2-3 sentence summary of the listing's strengths and primary areas for improvement, based on your search.

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

        const headers = new Headers();
        headers.set('Content-Type', 'text/plain');
        if (sources.length > 0) {
            headers.set('x-sources', encodeURIComponent(JSON.stringify(sources)));
        }

        return new Response(content, { status: 200, headers });

    } catch (error) {
        console.error('API/generate failed:', error);
        return new Response('Error processing your request.', { status: 500 });
    }
}