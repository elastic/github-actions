const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const _ = require('lodash');

async function handleLabeled(octokit, projectNumber, columnName, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        const owner = github.context.payload.repository.owner.login;
        const repo = github.context.payload.repository.name;
        var contentId, contentType, state;
        if (github.context.eventName == "issues") {
            contentId = github.context.payload.issue.node_id;
            state = github.context.payload.issue.state;
            contentType = 'Issue';
        } else if (github.context.eventName == "pull_request") {
            contentId = github.context.payload.pull_request.node_id;
            state = github.context.payload.pull_request.state;
            contentType = 'PullRequest';
        } else {
            core.setFailed(`Unrecognized event: ${github.context.eventName}`);
        }

        // See if the issue or PR is already in the project
        const existingCardId = await findProjectCardId();
        if (existingCardId) {
            console.log(`Card already exists in project ${projectNumber} for ${contentType} ${contentId}`);
            return;
        }

        console.log(`Creating a new card for ${state} ${contentType} [${contentId}] in project [${projectNumber}] column [${columnName}] matching label [${labelToMatch}], labeled by ${owner} of repo ${repo}`);

        try {
            const query = `{
                repository(name: "${repo}", owner: "${owner}") {
                    project(number: ${projectNumber}) {
                        columns(first: 50) {
                            nodes {
                                name,
                                id
                            }
                        }
                    }
                }
            }`;

            console.log(`Query for project columns:\n ${query}`)
            const response = await octokit(query);
            const columns = _.get(response, 'repository.project.columns.nodes');
            var targetColumnId;
            if (columns) {
                const targetColumn = _.find(columns, function(column) {
                    return (columnName == _.get(column, 'name'));
                });
                if (targetColumn) {
                    targetColumnId = _.get(targetColumn, 'id');
                }
            } else {
                core.setFailed(`Error adding ${contentType} to project ${projectNumber}: could not retrieve project columns - make sure the project number is correctly configured!`);
            }
            
            if (targetColumnId) {
                console.log(`Target column ID is ${targetColumnId}`);
                const mutation = `
                    mutation {
                        addProjectCard(input: { projectColumnId: "${targetColumnId}", contentId: "${contentId}" }) {
                            cardEdge {
                                node {
                                    id
                                }
                            }
                        }
                    }`;
                
                console.log(`Mutation: ${mutation}`);
                await octokit(mutation);
            } else {
                core.setFailed(`Error adding ${contentType} to project ${projectNumber}: column "${columnName}" was not found`);
            }
        } catch (error) {
            core.setFailed(`Error adding ${contentType} to project ${projectNumber} column ${columnName}: ${error.message}`);
        }
    }
}

async function handleUnlabeled(octokit, projectNumber, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        const owner = github.context.payload.repository.owner.login;
        const repo = github.context.payload.repository.name;
        var query, projectCardsPath, contentType;

        if (github.context.eventName == "issues") {
            contentType = 'Issue';
            query = `{
                repository(owner: "${owner}", name: "${repo}") {
                    issue(number: ${github.context.payload.issue.number}) {
                        projectCards {
                            edges {
                                node {
                                    project {
                                        number
                                    },
                                    id
                                }
                            }
                        }
                    }
                }
            }`;

            projectCardsPath = 'repository.issue.projectCards.edges';

        } else if (github.context.eventName == "pull_request") {
            contentType = 'Pull request';
            query = `{
                repository(owner: "${owner}", name: "${repo}") {
                    pullRequest(number: ${github.context.payload.pull_request.number}) {
                        projectCards {
                            edges {
                                node {
                                    project {
                                        number
                                    },
                                    id
                                }
                            }
                        }
                    }
                }
            }`;

            projectCardsPath = 'repository.pullRequest.projectCards.edges';
        }

        console.log(`Query for project cards:\n${query}`);

        const response = await octokit(query);
        
        const projectCards = _.get(response, projectCardsPath);

        if (projectCards) {
            const cardToRemove = _.find(projectCards, function(card) {
                return (projectNumber == _.get(card, 'node.project.number')); 
            });

            if (cardToRemove) {
                const cardId = _.get(cardToRemove, 'node.id');

                try {
                    const mutation = `mutation {
                        deleteProjectCard(input: {cardId: "${cardId}"}) {
                            deletedCardId
                        }
                    }`;
                    console.log(`Card removal mutation:\n${mutation}`);
                    await octokit(mutation);
                    console.log(`${contentType} removed from project ${projectNumber}`);
                } catch (error) {
                    core.setFailed(`Error removing ${contentType} from project: ${error.message}`);
                }
            } else {
                console.log(`No card found in project ${projectNumber} for a given ${contentType}`);
            }
        } else {
            core.setFailed(`Unable to retrieve cards for project ${projectNumber} - make sure it is configured correctly!`);
        }
    }
}

async function findProjectCardId(projectNumber) {
    const owner = github.context.payload.repository.owner.login;
    const repo = github.context.payload.repository.name;
    var query, projectCardsPath, cardId;

    if (github.context.eventName == "issues") {
        query = `{
            repository(owner: "${owner}", name: "${repo}") {
                issue(number: ${github.context.payload.issue.number}) {
                    projectCards {
                        edges {
                            node {
                                project {
                                    number
                                },
                                id
                            }
                        }
                    }
                }
            }
        }`;

        projectCardsPath = 'repository.issue.projectCards.edges';

    } else if (github.context.eventName == "pull_request") {
        query = `{
            repository(owner: "${owner}", name: "${repo}") {
                pullRequest(number: ${github.context.payload.pull_request.number}) {
                    projectCards {
                        edges {
                            node {
                                project {
                                    number
                                },
                                id
                            }
                        }
                    }
                }
            }
        }`;

        projectCardsPath = 'repository.pullRequest.projectCards.edges';
    }

    console.log(`Query for project cards:\n${query}`);

    const response = await octokit(query);
        
    const projectCards = _.get(response, projectCardsPath);

    if (projectCards) {
        const matchingCard = _.find(projectCards, function(card) {
            return (projectNumber == _.get(card, 'node.project.number')); 
        });

        if (matchingCard) {
            cardId = _.get(matchingCard, 'node.id');
        }
    }

    return cardId;
}

async function run() {
    const ghToken = core.getInput('ghToken');
    const octokit = graphql.defaults({
        headers: {
          authorization: `Bearer ${ghToken}`
        }
    });

    try {
        const issueMappings = JSON.parse(core.getInput('issue-mappings'));

        if (github.context.payload.action == "labeled") {
            for (const mapping of issueMappings) {
                await handleLabeled(octokit, mapping.projectNumber, mapping.columnName, mapping.label);
            };
            
        } else if (github.context.payload.action == "unlabeled") {
            for (const mapping of issueMappings) {
                await handleUnlabeled(octokit, mapping.projectNumber, mapping.label);
            };
        }
    } catch (error) {
        context = JSON.stringify(github.context, undefined, 2);
        core.setFailed(`Action failed with error: ${error.message}\n Event context:\n\n${context}`);
    }
}

run();