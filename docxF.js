const path = require('path');
const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const asyncfs = require('fs').promises;
const cheerio = require('cheerio');
const { DOMParser } = require('xmldom');
// const UOE = require('./UOE.js');
const axios = require('axios');
const https = require('https');

const { promisify } = require('util');
const asyncTimeout = promisify(setTimeout);

module.exports = {
  extractTXT: async function (filePath) {
    try {
      const inputFilePath = path.join(__dirname, 'data', 'output.xml');
      const outputFilePath = path.join(__dirname, 'data', 'output.txt');
      // const xmlContent = await asyncfs.readFile(inputFilePath, "utf8");
      const zip = new AdmZip(filePath);
      const xmlContent = zip.readAsText('word/document.xml');

      await asyncfs.writeFile(inputFilePath, xmlContent, 'utf8');

      const extractedText = await extractTextFromXML(xmlContent);

      await asyncfs.writeFile(outputFilePath, extractedText, 'utf8');
      // console.log('Text extracted and saved successfully.');
    } catch (error) {
      console.error('Error processing the XML file:', error);
    }
  },

  extractJSON: async function (filePath, FileName) {
    try {
      const authToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0YzkxZTkwODk1MGY1OGJmMzI5MDU2NyIsImlhdCI6MTcwMTA2MjY5NSwiZXhwIjoxNzAxMDgwNjk1fQ.nBEPSpIOxzmAHVi9ZHTkCejMI6lXnTmvjTsYPe-VzQI';

      const baseUrl = 'https://sibapi.exchangepointgroup.com';

      const inputHtml = await asyncfs.readFile(filePath, 'utf8');
      // Load the HTML into cheerio
      const $ = cheerio.load(inputHtml);

      // Remove style attributes from all elements
      $('head').remove();
      $('meta').remove();
      $('style').remove();
      $('*')
        .removeAttr('style')
        .removeAttr('start')
        .removeAttr('type')
        .removeAttr('lang')
        .removeAttr('class')
        .removeAttr('dir')
        .removeAttr('align')
        .removeAttr('link')
        .removeAttr('vlink');

      // Get the modified HTML
      const modifiedHtml = $.html();

      // await asyncfs.writeFile(
      //   path.join(__dirname, 'data/output', `modified.html`),
      //   JSON.stringify(modifiedHtml),
      //   'utf8',
      // );

      const extractedText = await processJSON(modifiedHtml);

      // try {
      //   // Create an array of promises for group and item requests
      //   const requests = extractedText.map((item) => createGroupAndItems(baseUrl, item, authToken));
      //   // Wait for all requests to complete
      //   // await Promise.all(requests);
      //   await queue.addAll(requests);
      // } catch (error) {
      //   console.log(error);
      // }

      await asyncfs.writeFile(
        path.join(__dirname, 'data/output', `${FileName}.json`),
        JSON.stringify(extractedText),
        'utf8',
      );
    } catch (error) {
      console.error(error);
    }
  },

  extractStringifyTXT: async function (filePath) {
    try {
      const outputFilePath = path.join(__dirname, 'data', 'output2.txt');
      const extractedText = await extractTXTfromDOCX(filePath);
      const jsonString = JSON.stringify(extractedText, null, 2);
      await asyncfs.writeFile(outputFilePath, jsonString, 'utf8');
    } catch (error) {
      console.error('Error processing the DOCX file:', error);
    }
  },
};

async function extractTextFromXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  // console.log(xmlDoc);
  function extractText(node) {
    let result = '';
    if (node.nodeType === 3) {
      // Node.TEXT_NODE
      result = node.nodeValue;
    } else if (node.nodeType === 1) {
      // Node.ELEMENT_NODE
      for (let i = 0; i < node.childNodes.length; i += 1) {
        const child = node.childNodes[i];
        result += extractText(child);
      }
      if (node.nodeName === 'w:p' || node.nodeName === 'w:body') {
        // Add a newline after paragraphs or other specific elements
        result += '\n';
      }
    }
    return result;
  }

  return extractText(xmlDoc.documentElement);
}
async function processJSON(inputJson) {
  inputJson = inputJson
    .replace(/<\/?span[^>]*>/g, '')
    .replace(/\n/g, '')
    .replace(/&nbsp;/g, '');

  const questionGroups = [];
  const regex = /#startgroup([\s\S]*?)#endgroup/g;
  let match;

  while ((match = regex.exec(inputJson)) !== null) {
    questionGroups.push(match[1].trim());
  }
  // return questionGroups;
  const evaluatedQuestions = questionGroups.map((question, index) => ({
    [index + 1]: question.trim(),
  }));

  // return evaluatedQuestions;

  const resultArray = evaluatedQuestions.map((questionObj) => {
    const passageRegex = /<p><b>.*?<\/b><\/p>/i;

    let [questionNumber, questionText] = Object.entries(questionObj)[0];

    const titleMatch = questionText.match(passageRegex);

    if (titleMatch) {
      // console.log(titleMatch);
      const passageName = titleMatch[0].trim();
      // console.log(passageName);

      const passageText = questionText;

      return {
        [questionNumber]: {
          [passageName]: passageText,
        },
      };
    }
  });
  // return resultArray;

  const res = await processQuestions(resultArray);
  // return res;

  const result = transformArray(res);

  return result;
}

const PASSAGES = {};

async function processQuestions(inputArray) {
  let questionKey;
  let questionText;

  const processedArray = inputArray.map((item) => {
    const [questionNumber, questionObj] = Object.entries(item)[0];
    questionKey = Object.keys(questionObj)[0];

    questionText = Object.values(questionObj)[0];

    // Check if the questionObj has keys containing 'PASSAGE'
    const hasPassage = Object.keys(questionObj).some(
      (key) => key.toLowerCase().includes('texte') || key.toLowerCase().includes('passage'),
    );

    // Initialize the passage variable

    // If the questionObj has keys containing 'PASSAGE', extract the passage text
    if (hasPassage) {
      const passageRegex = /<p><b>(.*?)<\/p>(?=(?:<p>\d+\.))/s;
      const passageMatch = questionText.match(passageRegex);
      if (passageMatch) {
        let passage = passageMatch[0].trim();

        // Replace the last occurrence of <p> with an empty string
        passage = passage.replace(/<p><\/p>/g, '').replace(/<p>(?=[^<]*\d+\.)/s, '');
        // console.log(passage);
        PASSAGES[questionKey] = passage;
      } else {
        console.log('Regex did not match for the following text:');
      }
    }

    const result = processQuestionText(questionText);

    // Convert the result array to the desired format
    const formattedResult = {
      [questionNumber]: {
        [Object.keys(questionObj)[0]]: result,
      },
    };

    // console.log(formattedResult);
    return formattedResult;
  });

  return processedArray;
}

async function extractTXTfromDOCX(inputPath) {
  try {
    const result = await mammoth.extractRawText({ path: inputPath });
    const text = result.value;
    return text;
  } catch (extractionError) {
    console.error(`Error extracting text: ${extractionError}`);
    throw new Error('Error extracting text from the document.');
  }
}

function transformArray(inputArray) {
  // console.log(inputArray);
  const transformedArray = inputArray.map((item) => {
    const groupKey = Object.keys(item)[0];

    const innerObject = Object.values(item)[0];
    // console.log(innerObject);
    const innerKey = Object.keys(innerObject)[0];

    const questionArray = Object.values(innerObject)[0];
    // console.log(questionArray);
    const itemQuestions = transformQuestions(questionArray);

    return {
      groupType: Number(groupKey),
      instruction:
        innerKey.toLowerCase().includes('texte') || innerKey.toLowerCase().includes('passage')
          ? PASSAGES[innerKey]
          : innerKey,
      items: itemQuestions,
    };
  });

  return transformedArray;
}

function transformQuestions(questions) {
  return questions.map((question) => {
    const order = Number(question.question.match(/^<p>(\d+)\./)[1]);
    // console.log(question.question);
    const modifiedQuestion = {
      order,
      // subject: UOE.id,
      question: question.question.replace(/^<p>(\d+)\./, '').trim(),
      options: transformOptions(question.options),
      answer: 'igzam1',
    };

    // UOE.tos.forEach((topic) => {
    //   topic.subTopics.forEach((subTopic) => {
    //     if (order >= subTopic.start && order <= subTopic.end) {
    //       modifiedQuestion.topic = topic.topic;
    //       modifiedQuestion.topicIndex = topic.index;
    //       modifiedQuestion.topicId = topic.id;
    //       modifiedQuestion.subTopic = subTopic.title;
    //       modifiedQuestion.subTopicId = subTopic.id;
    //     }
    //   });
    // });

    return modifiedQuestion;
  });
}

function transformOptions(options) {
  console.log(options);

  // Check if options is an array
  if (Array.isArray(options)) {
    const optionLetters = ['igzam1', 'igzam2', 'igzam3', 'igzam4'];

    return options.map((option, index) => ({
      option: option.replace(/[A-D]\./, '').trim(),
      returnValue: optionLetters[index],
    }));
  } else {
    // Define a function to generate returnValue based on index
    const generateReturnValue = (index) => `igzam${index + 1}`;

    // Extract options using a regular expression
    const optionsRegex = /<li>([^<]+)<\/li>/g;

    const optionsMatch = Array.from(options.matchAll(optionsRegex), (match) => match[1]);

    // Transform the options using the map function
    const transformedOptions = optionsMatch.map((option, index) => ({
      option: `<p>${option.replace(/\b\s+\b/g, ' ').trim()}</p>`,
      returnValue: generateReturnValue(index),
    }));

    return transformedOptions;
  }
}

async function createGroupAndItems(baseUrl, sanitizedItem, authToken) {
  const items = sanitizedItem.items;
  const instruction = sanitizedItem.instruction;

  // Request to create a group
  const groupResponse = await makeRequest(
    `${baseUrl}/api/v1/groups`,
    'post',
    {
      instruction,
      groupType: 2,
      subjectId: items[0].subject,
      topic: items[0].topic,
      topicId: items[0].topicId,
      subTopic: items[0].subTopic,
      subTopicId: items[0].subTopicId,
    },
    authToken,
  );

  const groupData = groupResponse.data;

  if (groupData.success) {
    const groupId = groupData.data.id;

    // Set groupId and to each item in the items array
    items.forEach((item) => {
      item.group = groupId;
    });

    // Create an array of promises for item requests
    const itemPromises = items.map(async (item) => {
      // Request to create an item with the group id
      const itemResponse = await makeRequest(
        `${baseUrl}/api/v1/questions`,
        'post',
        item,
        authToken,
      );

      // Add created=true to the item after successful creation
      item.created = itemResponse.data.success;

      // Add delay between requests
      await asyncTimeout(1000);
    });

    // Wait for all item requests to complete
    await Promise.all(itemPromises);
  }
}

const makeRequest = async (url, method, data, authToken) => {
  try {
    const response = await axios({
      method,
      url,
      data,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log(response.data);
    return response.data;
  } catch (error) {
    // Handle errors here
    console.error(error.response.data);
    throw error;
  }
};

function processQuestionText(questionText) {
  let questionsRegex, optionsRegex;

  if (/(\d+\.)\s*(.*?)<\/p>(?=<ol>)/gs.test(questionText)) {
    // Use the first set of regex patterns
    questionsRegex = /<p>(\d+\.)\s*(.*?)<\/p>(?=<ol>)/gs;
    optionsRegex = /<ol>.*?<\/ol>/gs;

    const matches = questionText.matchAll(questionsRegex);

    let result = Array.from(matches, (match) => {
      const question = match[0].replace(/<p><\/p>/g, '');

      // Capture options using optionsRegex
      const optionsMatch = questionText.match(optionsRegex);
      const options = optionsMatch ? optionsMatch[0] : '';

      return {
        question,
        options,
      };
    });
    return result;
  } else {
    const questionsRegex2 = /<p>(\d+\..*?)<\/p>/gs;
    const optionsRegex2 = /<p>([A-Z]\..*?)<\/p>/gs;

    const matches = Array.from(questionText.matchAll(questionsRegex2), (match) => match[1]);

    let result = matches.map((match, i) => {
      const question = `<p>${match.replace(/<p><\/p>/g, '')}</p>`;

      let optionsMatches = [];
      const nextMatchIndex =
        i < matches.length - 1 ? questionText.indexOf(matches[i + 1]) : undefined;

      const optionsText =
        i < matches.length - 1
          ? questionText.substring(questionText.indexOf(match), nextMatchIndex)
          : questionText.substring(questionText.indexOf(match));

      optionsMatches = Array.from(
        optionsText.matchAll(optionsRegex2),
        (optMatch) => `<p>${optMatch[1]}</p>`,
      );

      return {
        question,
        options: optionsMatches,
      };
    });

    return result;
  }
}
