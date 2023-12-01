const path = require('path');
const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const asyncfs = require('fs').promises;
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
      const outputFilePath = path.join(__dirname, 'data/output', `${FileName}.json`);
      const inputJson = await asyncfs.readFile(filePath, 'utf8');
      const extractedText = await processJSON(inputJson);
      const sanitizedData = await sanitizeData(extractedText);

      const authToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0YzkxZTkwODk1MGY1OGJmMzI5MDU2NyIsImlhdCI6MTcwMTA2MjY5NSwiZXhwIjoxNzAxMDgwNjk1fQ.nBEPSpIOxzmAHVi9ZHTkCejMI6lXnTmvjTsYPe-VzQI';

      const baseUrl = 'https://sibapi.exchangepointgroup.com';

      const sanitizedDataValues = Object.values(sanitizedData);

      // // Create an array of promises for group and item requests
      // const requests = sanitizedDataValues.map((sanitizedItem) =>
      //   createGroupAndItems(baseUrl, sanitizedItem, authToken),
      // );
      // Wait for all requests to complete
      // await Promise.all(requests);

      await asyncfs.writeFile(outputFilePath, JSON.stringify(sanitizedData), 'utf8');
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
    // const passageRegex = /^(.*?\.|Texte\s+[IVXLC]+)\s*([\s\S]*)/i

    // const passageRegex = /^(.*?\.|[IVXLC]+\.\s\(PROSE\s+)\s*([\s\S]*)/i;

    const passageRegex = /^(.*?\.|[IVXLC]+\.\s\(PROSE\s+\)|[IVXLC]+\.\s\(POETRY\s+\))\s*([\s\S]*)/i;

    let [questionNumber, questionText] = Object.entries(questionObj)[0];

    const passageMatch = questionText.match(passageRegex);
    // console.log(passageMatch);

    if (passageMatch) {
      const passageName = passageMatch[1].trim();

      const passageText = passageMatch[2].trim();

      return {
        [questionNumber]: {
          [passageName]: passageText,
        },
      };
    } else {
      let newText = questionText.replace(/\r\n/g, '+');
      const passageMatch = newText.match(passageRegex);
      newText = newText.replace(passageRegex, '').trim();

      const passageName = passageMatch[1].trim().replace(/\+/g, '\r\n');
      const passageText = passageMatch[2].trim().replace(/\+/g, '\r\n');

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
    // console.log(questionKey);
    questionText = Object.values(questionObj)[0];

    // Check if the questionObj has keys containing 'PASSAGE'
    const hasPassage = Object.keys(questionObj).some(
      (key) => key.toLowerCase().includes('prose') || key.toLowerCase().includes('poetry'),
    );

    // Initialize the passage variable
    let passage = '';

    // If the questionObj has keys containing 'PASSAGE', extract the passage text
    if (hasPassage) {
      // const passageRegex = /^.*?(?=\d+\.\t)/s;
      const passageRegex = /^.*?(?=\r?\n\d+\.)/s;

      const passageMatch = questionText.match(passageRegex);

      if (passageMatch) {
        passage = passageMatch[0].trim();
        // console.log(passage);

        PASSAGES[questionKey] = passage;
      } else {
        console.log('Regex did not match for the following text:');
      }
    }
    // Updated regex pattern to capture question and all options
    const regexPattern = /(\d+\.\t[^\r\n]+)([\s\S]*?)(?=(\d+\.\t|$))/g;
    const optionsRegex = /[A-D]\.\t[^\r\n]+/g;

    // questionText = questionText.replace(passageRegex, '').trim();
    const matches = questionText.matchAll(regexPattern);

    let result = Array.from(matches, (match) => {
      const question = match[1].trim();

      const options = Array.from(match[0].matchAll(optionsRegex), (optionMatch) => optionMatch[0]);

      return {
        // passage,
        question,
        options,
      };
    });

    // If no matches are found but options are present, create a result with an empty question
    if (result.length === 0 && optionsRegex.test(questionText)) {
      // console.log(questionText);
      const newResult = extractSpecialCase(questionText);
      result = [...newResult];
    }

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

function extractSpecialCase(text) {
  console.log(text);
  const regex = /(\d+\.\s*[\s\S]*?)(?=(\d+\.\s*[\s\S]*|$))/g;
  const questions = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const questionText = match[1].trim();
    const questionRegex = /(\d+\.)\s*([\s\S]*?)(?=[A-D]\.)/g;
    const questionMatch = questionRegex.exec(questionText);

    if (questionMatch) {
      const questionNumber = questionMatch[0];
      const optionsRegex = /[A-D]\.\s*([\s\S]*?)(?=[A-D]\.|\s*$)/g;
      const options = [];
      let optionMatch;

      while ((optionMatch = optionsRegex.exec(questionText)) !== null) {
        options.push(optionMatch[1].trim());
      }

      questions.push({
        passage: '',
        question: questionNumber,
        options,
      });
    }
  }

  return questions;
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
    const passageQuestion = transformQuestions(questionArray);

    return {
      groupType: Number(groupKey),
      instruction:
        innerKey.toLowerCase().includes('prose') || innerKey.toLowerCase().includes('poetry')
          ? PASSAGES[innerKey]
          : innerKey,
      items: passageQuestion,
    };
  });

  return transformedArray;
}

function transformQuestions(questions) {
  //  console.log(questions);
  return questions.map((question) => {
    const num = Number(question.question.match(/^(\d+)\./)[1]);
    const modifiedQuestion = {
      num,
      // subject: UOE.id,
      order: num,
      question: question.question.replace(/^\d+\n/, '').trim(),
      options: transformOptions(question.options),
      answer: 'igzam1',
    };

    // UOE.tos.forEach((topic) => {
    //   topic.subTopics.forEach((subTopic) => {
    //     if (num >= subTopic.start && num <= subTopic.end) {
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
  const optionLetters = ['igzam1', 'igzam2', 'igzam3', 'igzam4'];

  return options.map((option, index) => ({
    option: option.replace(/[A-D]\./, '').trim(),
    returnValue: optionLetters[index],
  }));
}

async function sanitizeData(data) {
  const sanitizedData = JSON.stringify(data).replace(/\\r\\n|\\r|\\n|\\t/g, '');

  const result = await JSON.parse(sanitizedData);
  // return data;
  return result;
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
