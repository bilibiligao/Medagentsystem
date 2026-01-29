const text = "<unused94>This is a thought process.\nIt has multiple lines.<unused95>This is the answer.";
const text2 = "  <unused94>Thought starting with spaces<unused95>Answer";
const text3 = "<think>DeepSeek style</think>Answer";

// Regex from my code
const regex = /(?:<think>|<unused94>)([\s\S]*?)(?:<\/think>|<unused95>|$)/i;

const tests = [text, text2, text3];

tests.forEach((t, i) => {
    const match = t.match(regex);
    console.log(`Test ${i+1}:`);
    if (match) {
        console.log("  Matched!");
        console.log("  Content:", match[1]);
        
        const matchIndex = match.index;
        const matchLength = match[0].length;
        const prefix = t.substring(0, matchIndex);
        const suffix = t.substring(matchIndex + matchLength).trim();
        console.log("  Final:", prefix + suffix);
    } else {
        console.log("  No match.");
    }
});