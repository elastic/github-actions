const ProjectAssigner = require('../project-assigner');
let projectAssigner;

const mockIssuesContext = {
  owner: 'mocked_owner',
  repo: 'repo1',
  labelName: 'project',
  itemType: 'Issue',
  itemNumber: 123,
  itemNodeId: 'mocked_issue_node_id',
  itemQuery: 'issue(number: 123)',
  projectCardsPath: 'repository.issue.projectCards.edges',
}

const mockPRsContext = {
  owner: 'mocked_owner',
  repo: 'repo1',
  labelName: 'project',
  itemType: 'Pull request',
  itemNumber: 543,
  itemNodeId: 'mocked_pr_node_id',
  itemQuery: 'pullRequest(number: 543)',
  projectCardsPath: 'repository.pullRequest.projectCards.edges',
}

describe("projectAssigner", () => {
  beforeEach(() => {
    jest.resetModules();
    projectAssigner = new ProjectAssigner();
  });

  describe("handleLabeled", () => {
    it("creates a project card when a specific label is added to an issue", async () => {

      const mockFindProjectCardId = jest.fn().mockResolvedValueOnce(null);
      const mockFindColumnIdForColumnName = jest.fn().mockResolvedValueOnce('mocked_column_id');
      const mockCreateCard = jest.fn().mockResolvedValueOnce('');

      jest.spyOn(projectAssigner, 'findProjectCardId').mockImplementation(mockFindProjectCardId);
      jest.spyOn(projectAssigner, 'findColumnIdForColumnName').mockImplementation(mockFindColumnIdForColumnName);
      jest.spyOn(projectAssigner, 'createCard').mockImplementation(mockCreateCard);

      const octokit = {};
      const projectNumber = 17;
      const columnName = "In progress";
      const labelToMatch = "project";
      const projectScope = "repo";
      const context = mockIssuesContext;
      await projectAssigner.handleLabeled(octokit, projectNumber, columnName, labelToMatch, projectScope, context);
      expect(mockCreateCard.mock.calls.length).toBe(1);
      expect(mockCreateCard.mock.calls[0][1]).toBe('mocked_column_id');
      expect(mockCreateCard.mock.calls[0][2]).toBe('mocked_issue_node_id');
    });

    it("does not create a project card when a card already exists for the issue", async () => {

      const mockFindProjectCardId = jest.fn().mockResolvedValueOnce('mocked_project_card_id');
      const mockFindColumnIdForColumnName = jest.fn().mockResolvedValueOnce('mocked_column_id');
      const mockCreateCard = jest.fn().mockResolvedValueOnce('');

      jest.spyOn(projectAssigner, 'findProjectCardId').mockImplementation(mockFindProjectCardId);
      jest.spyOn(projectAssigner, 'findColumnIdForColumnName').mockImplementation(mockFindColumnIdForColumnName);
      jest.spyOn(projectAssigner, 'createCard').mockImplementation(mockCreateCard);

      const octokit = {};
      const projectNumber = 17;
      const columnName = "In progress";
      const labelToMatch = "project";
      const projectScope = "repo";
      const context = mockIssuesContext;
      await projectAssigner.handleLabeled(octokit, projectNumber, columnName, labelToMatch, projectScope, context);
      expect(mockCreateCard.mock.calls.length).toBe(0);
    });

    it("does not create a project card when the label doesn't match", async () => {

      const mockFindProjectCardId = jest.fn().mockResolvedValueOnce('mocked_project_card_id');
      const mockFindColumnIdForColumnName = jest.fn().mockResolvedValueOnce('mocked_column_id');
      const mockCreateCard = jest.fn().mockResolvedValueOnce('');

      jest.spyOn(projectAssigner, 'findProjectCardId').mockImplementation(mockFindProjectCardId);
      jest.spyOn(projectAssigner, 'findColumnIdForColumnName').mockImplementation(mockFindColumnIdForColumnName);
      jest.spyOn(projectAssigner, 'createCard').mockImplementation(mockCreateCard);

      const octokit = {};
      const projectNumber = 17;
      const columnName = "In progress";
      const labelToMatch = "pancakes";
      const projectScope = "repo";
      const context = mockIssuesContext;
      await projectAssigner.handleLabeled(octokit, projectNumber, columnName, labelToMatch, projectScope, context);
      expect(mockCreateCard.mock.calls.length).toBe(0);
      expect(mockFindProjectCardId.mock.calls.length).toBe(0);
      expect(mockFindColumnIdForColumnName.mock.calls.length).toBe(0);
    });

    it("requires a projectNumber, columnName and projectScope", async () => {
      const octokit = {};
      const projectNumber = 17;
      const columnName = "In progress";
      const labelToMatch = "project";
      const projectScope = "repo";
      const context = mockIssuesContext;
      await expect(projectAssigner.handleLabeled(octokit, undefined, columnName, labelToMatch, projectScope, context)).rejects.toThrow();
      await expect(projectAssigner.handleLabeled(octokit, projectNumber, undefined, labelToMatch, projectScope, context)).rejects.toThrow();
      await expect(projectAssigner.handleLabeled(octokit, projectNumber, columnName, labelToMatch, undefined, context)).rejects.toThrow();
    });
  });

  describe("handleUnlabeled", () => {
    it("removes a project card when a specific label is removed from an issue", async () => {
      const mockFindProjectCardsForPayloadItem = jest.fn().mockResolvedValueOnce([
        {
          "node": {
            "project": {
              "number": 17
            },
            "id": "mocked_card_id"
          }
        }
      ]);
      const mockRemoveCard = jest.fn().mockResolvedValueOnce('');
      jest.spyOn(projectAssigner, 'findProjectCardsForPayloadItem').mockImplementation(mockFindProjectCardsForPayloadItem);
      jest.spyOn(projectAssigner, 'removeCard').mockImplementation(mockRemoveCard);

      const octokit = {};
      const projectNumber = 17;
      const labelToMatch = "project";
      const context = mockIssuesContext;
      await projectAssigner.handleUnlabeled(octokit, projectNumber, labelToMatch, context);
      expect(mockFindProjectCardsForPayloadItem.mock.calls.length).toBe(1);
      expect(mockRemoveCard.mock.calls.length).toBe(1);
      expect(mockRemoveCard.mock.calls[0][1]).toBe('mocked_card_id');
    });

    it("does not remove a project card when the issue's project number doesn't match", async () => {
      const mockFindProjectCardsForPayloadItem = jest.fn().mockResolvedValueOnce([
        {
          "node": {
            "project": {
              "number": 404
            },
            "id": "mocked_card_id"
          }
        }
      ]);
      const mockRemoveCard = jest.fn().mockResolvedValueOnce('');
      jest.spyOn(projectAssigner, 'findProjectCardsForPayloadItem').mockImplementation(mockFindProjectCardsForPayloadItem);
      jest.spyOn(projectAssigner, 'removeCard').mockImplementation(mockRemoveCard);

      const octokit = {};
      const projectNumber = 17; // 17 should not match 404
      const labelToMatch = "project";
      const context = mockIssuesContext;
      await projectAssigner.handleUnlabeled(octokit, projectNumber, labelToMatch, context);
      expect(mockFindProjectCardsForPayloadItem.mock.calls.length).toBe(1);
      expect(mockRemoveCard.mock.calls.length).toBe(0);
    });

    it("does not remove a project card when a card does not exist for the issue", async () => {
      const mockFindProjectCardsForPayloadItem = jest.fn().mockResolvedValueOnce(null);
      const mockRemoveCard = jest.fn().mockResolvedValueOnce('');
      jest.spyOn(projectAssigner, 'findProjectCardsForPayloadItem').mockImplementation(mockFindProjectCardsForPayloadItem);
      jest.spyOn(projectAssigner, 'removeCard').mockImplementation(mockRemoveCard);

      const octokit = {};
      const projectNumber = 17;
      const labelToMatch = "project";
      const context = mockIssuesContext;
      await projectAssigner.handleUnlabeled(octokit, projectNumber, labelToMatch, context);
      expect(mockFindProjectCardsForPayloadItem.mock.calls.length).toBe(1);
      expect(mockRemoveCard.mock.calls.length).toBe(0);
    });

    it("does not remove a project card when the label doesn't match", async () => {
      const mockFindProjectCardsForPayloadItem = jest.fn().mockResolvedValueOnce(null);
      const mockRemoveCard = jest.fn().mockResolvedValueOnce('');
      jest.spyOn(projectAssigner, 'findProjectCardsForPayloadItem').mockImplementation(mockFindProjectCardsForPayloadItem);
      jest.spyOn(projectAssigner, 'removeCard').mockImplementation(mockRemoveCard);

      const octokit = {};
      const projectNumber = 17;
      const labelToMatch = "pancakes"; // does not match the "project" label from mockIssuesContext
      const context = mockIssuesContext;
      await projectAssigner.handleUnlabeled(octokit, projectNumber, labelToMatch, context);
      expect(mockFindProjectCardsForPayloadItem.mock.calls.length).toBe(0);
      expect(mockRemoveCard.mock.calls.length).toBe(0);
    });

    it("requires a projectNumber", async () => {
      const octokit = {};
      const labelToMatch = "project";
      const context = mockIssuesContext;
      await expect(projectAssigner.handleUnlabeled(octokit, undefined, labelToMatch, context)).rejects.toThrow();
    });
  });

  describe("normalizeGithubContext", () => {
    it("returns a normalized context for an issue event", () => {
      const mockIssuesGithubContext = {
        payload: {
          repository: {
            owner: {
              login: 'mocked_owner'
            },
            name: 'repo1'
          },
          label: {
            name: 'project'
          },
          issue: {
            number: 123,
            node_id: 'mocked_issue_node_id'
          }
        },
        eventName: 'issues'
      };
      expect(JSON.stringify(projectAssigner.normalizedGithubContext(mockIssuesGithubContext)))
        .toBe(JSON.stringify(mockIssuesContext));
    });

    it("returns a normalied context for a pull request event", () => {
      const mockPRsGithubContext = {
        payload: {
          repository: {
            owner: {
              login: 'mocked_owner'
            },
            name: 'repo1'
          },
          label: {
            name: 'project'
          },
          pull_request: {
            number: 543,
            node_id: 'mocked_pr_node_id'
          }
        },
        eventName: 'pull_request'
      };
      expect(JSON.stringify(projectAssigner.normalizedGithubContext(mockPRsGithubContext)))
        .toBe(JSON.stringify(mockPRsContext));
    });
  });

  describe("removeCard", () => {
    it("removes a card", async () => {
      const mockRemoveCardMutationResponse = JSON.parse(`{
        "deleteProjectCard": {
          "deletedCardId": "MDExOlByb2plY3RDYXJkNTkyNjkyNzk="
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockRemoveCardMutationResponse);
      const cardId = 'MDExOlByb2plY3RDYXJkNTkyNjkyNzk=';
      await projectAssigner.removeCard(mOctokit, cardId);
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        mutation {
          deleteProjectCard(input: {cardId: "MDExOlByb2plY3RDYXJkNTkyNjkyNzk="}) {
              deletedCardId
          }
      }`.replace(/\s+/g, ''));
    });

    it("throws an error when attempting to remove a card with an invalid card ID", async () => {
      // GitHub GraphQL responds with this payload when an invalid card ID is specified:
      /*
        "data": {
          "deleteProjectCard": null
        },
        "errors": [
          {
            "type": "NOT_FOUND",
            "path": [
              "deleteProjectCard"
            ],
            "locations": [
              {
                "line": 2,
                "column": 11
              }
            ],
            "message": "Could not resolve to a node with the global id of 'pancakes'."
          }
        ]
      */
      // Octokit throws the error, so our code is not responsible for parsing that raw GraphQL response.
      const mOctokit = jest.fn().mockRejectedValueOnce(new Error("Could not resolve to a node with the global id of 'pancakes'."));
      const cardId = 'pancakes';
      await expect(projectAssigner.removeCard(mOctokit, cardId)).rejects.toThrow();
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        mutation {
          deleteProjectCard(input: {cardId: "pancakes"}) {
              deletedCardId
          }
      }`.replace(/\s+/g, ''));

    });
  });

  describe("findProjectCardsForPayloadItem", () => {
    it("finds project cards for an existing project issue", async () => {
      const mockProjectCardsResponse = JSON.parse(`{
        "repository": {
          "issue": {
            "projectCards": {
              "edges": [
                {
                  "node": {
                    "project": {
                      "number": 1
                    },
                    "id": "MDExOlByb2plY3RDYXJkNTc5MzQxMzE="
                  }
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockProjectCardsResponse);
      const projectCards = await projectAssigner.findProjectCardsForPayloadItem(mOctokit, mockIssuesContext);
      expect(projectCards.length).toBe(1);
      expect(projectCards[0].node.id).toBe('MDExOlByb2plY3RDYXJkNTc5MzQxMzE=');
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        {
          repository(owner: "mocked_owner", name: "repo1") {
              issue(number: 123) {
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
        }`.replace(/\s+/g, ''));
    });

    it("finds project cards for an existing project pull request", async () => {
      const mockProjectCardsResponse = JSON.parse(`{
        "repository": {
          "pullRequest": {
            "projectCards": {
              "edges": [
                {
                  "node": {
                    "project": {
                      "number": 1
                    },
                    "id": "MDExOlByb2plY3RDYXJkNTkyNjkyNzk="
                  }
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockProjectCardsResponse);
      const projectCards = await projectAssigner.findProjectCardsForPayloadItem(mOctokit, mockPRsContext);
      expect(projectCards.length).toBe(1);
      expect(projectCards[0].node.id).toBe('MDExOlByb2plY3RDYXJkNTkyNjkyNzk=');
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        {
          repository(owner: "mocked_owner", name: "repo1") {
            pullRequest(number: 543) {
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
        }`.replace(/\s+/g, ''));
    });

    it("finds no project cards for an issue assigned to no projects", async () => {
      const mockProjectCardsResponse = JSON.parse(`{
        "repository": {
          "issue": {
            "projectCards": {
              "edges": []
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockProjectCardsResponse);
      const projectCards = await projectAssigner.findProjectCardsForPayloadItem(mOctokit, mockIssuesContext);
      expect(projectCards.length).toBe(0);
    });

    it("throws an error when trying to find project cards for an issue that does not exist", async () => {
      // GitHub GraphQL responds with this payload when, for example, an invalid content ID is specified:
      /*
      {
          "data": {
            "repository": {
              "issue": null
            }
          },
          "errors": [
            {
              "type": "NOT_FOUND",
              "path": [
                "repository",
                "issue"
              ],
              "locations": [
                {
                  "line": 3,
                  "column": 21
                }
              ],
              "message": "Could not resolve to an Issue with the number of 404."
            }
          ]
      }
      */
      // Octokit throws the error, so our code is not responsible for parsing that raw GraphQL response.
      const mOctokit = jest.fn().mockRejectedValueOnce(new Error("Could not resolve to an Issue with the number of 404."))
      await expect(projectAssigner.findProjectCardsForPayloadItem(mOctokit, mockIssuesContext)).rejects.toThrow();
    });
  });

  describe("createCard", () => {
    it("creates a card", async () => {
      const mockCardMutationResponse = JSON.parse(`{
        "addProjectCard": {
          "cardEdge": {
            "node": {
              "id": "MDExOlByb2plY3RDYXJkNTkyNjcyNzc="
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockCardMutationResponse);
      const projectColumnId = 'PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q';
      const contentId = 'mocked_issue_node_id';
      await projectAssigner.createCard(mOctokit, projectColumnId, contentId);
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        mutation {
          addProjectCard(input: { projectColumnId: "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q", contentId: "mocked_issue_node_id" }) {
              cardEdge {
                  node {
                      id
                  }
              }
          }
        }`.replace(/\s+/g, ''));
    });

    it("throws an error when attempting to create a card with an invalid issue content ID", async () => {
      // GitHub GraphQL responds with this payload when, for example, an invalid content ID is specified:
      /*
      {
        "data": {
          "addProjectCard": null
        },
        "errors": [
          {
            "type": "NOT_FOUND",
            "path": [
              "addProjectCard"
            ],
            "locations": [
              {
                "line": 3,
                "column": 11
              }
            ],
            "message": "Could not resolve to ProjectCardItem node with the global id of 'pancakes'."
          }
        ]
      }*/
      // Octokit throws the error, so our code is not responsible for parsing that raw GraphQL response.
      const mOctokit = jest.fn().mockRejectedValueOnce(new Error("Could not resolve to ProjectCardItem node with the global id of 'pancakes'."));
      const projectColumnId = 'PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q';
      const contentId = 'pancakes';
      await expect(projectAssigner.createCard(mOctokit, projectColumnId, contentId)).rejects.toThrow();
    });
  });

  describe("findColumnIdForColumnName", () => {
    const mockColumnQueryResponseForRepoProject = JSON.parse(`{
      "repository": {
        "project": {
          "columns": {
            "nodes": [
              {
                "name": "To Do",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0A"
              },
              {
                "name": "In progress",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q"
              },
              {
                "name": "Done",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0g"
              }
            ]
          }
        }
      }
    }`);
    const mockColumnQueryResponseForOrgProject = JSON.parse(`{
      "organization": {
        "project": {
          "columns": {
            "nodes": [
              {
                "name": "To Do",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0A"
              },
              {
                "name": "In progress",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q"
              },
              {
                "name": "Done",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0g"
              }
            ]
          }
        }
      }
    }`);
    const mockColumnQueryResponseForUserProject = JSON.parse(`{
      "user": {
        "project": {
          "columns": {
            "nodes": [
              {
                "name": "To Do",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0A"
              },
              {
                "name": "In progress",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q"
              },
              {
                "name": "Done",
                "id": "PC_lQDOA7oDiM4VBNFezgC6epXOANPw0g"
              }
            ]
          }
        }
      }
    }`);

    describe("find columns in projects with different projectScope", () => {
      it("finds a column in a repo project", async () => {
        const projectScope = "repo";
        const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryResponseForRepoProject);
        const projectNumber = 17;
        const columnName = "In progress";
        const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
        expect(column).toBe('PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q')
        expect(mOctokit.mock.calls.length).toBe(1);
        expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
          {
            repository(owner: "mocked_owner", name: "repo1") {
                project(number: 17) {
                    columns(first: 50) {
                        nodes {
                            name,
                            id
                        }
                    }
                }
            }
          }`.replace(/\s+/g, ''));
      });

      it("finds a column in an organization project", async () => {
        const projectScope = "org";
        const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryResponseForOrgProject);
        const projectNumber = 17;
        const columnName = "In progress";
        const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
        expect(column).toBe('PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q')
        expect(mOctokit.mock.calls.length).toBe(1);
        expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
          {
            organization(login: "mocked_owner") {
                project(number: 17) {
                    columns(first: 50) {
                        nodes {
                            name,
                            id
                        }
                    }
                }
            }
          }`.replace(/\s+/g, ''));
      });

      it("finds a column in a user project", async () => {
        const projectScope = "user";
        const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryResponseForUserProject);
        const projectNumber = 17;
        const columnName = "In progress";
        const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
        expect(column).toBe('PC_lQDOA7oDiM4VBNFezgC6epXOANPw0Q')
        expect(mOctokit.mock.calls.length).toBe(1);
        expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
          {
            user(login: "mocked_owner") {
                project(number: 17) {
                    columns(first: 50) {
                        nodes {
                            name,
                            id
                        }
                    }
                }
            }
          }`.replace(/\s+/g, ''));
      });
    });

    describe("failure cases when finding columns", () => {
      it("fails to find a column when given a valid project number and missing column name", async () => {
        const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryResponseForRepoProject);
        const projectNumber = 17;
        const projectScope = "repo";
        const columnName = "pancakes";
        const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
        expect(column).toBe(null);
      });

      it("fails to find a column when given an valid project number", async () => {
        const mockColumnQueryNoProjectResponse = JSON.parse(`{
          "repository": {
            "project": null
          }
        }`);
        const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryNoProjectResponse);
        const projectNumber = 404;
        const projectScope = "repo";
        const columnName = "pancakes";
        const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
        expect(column).toBe(null);
      });
    });


    it("finds a column in an organization project for a column named Inbox", async () => {
      const projectScope = "org";
      const mockColumnQueryResponseForOrgProjectBug = JSON.parse(`{
        "organization": {
          "project": {
            "columns": {
              "nodes": [
                {
                  "name": "Inbox",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjU1MTUwMg=="
                },
                {
                  "name": "Backlog",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjU1MTUxNg=="
                },
                {
                  "name": "Future",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjU1MTYxNQ=="
                },
                {
                  "name": "Stalled PRs",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjU1MTYzMg=="
                },
                {
                  "name": "Other",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjgyMDU2Mg=="
                },
                {
                  "name": "Closed",
                  "id": "MDEzOlByb2plY3RDb2x1bW4xMjU1MTY0Nw=="
                },
                {
                  "name": "icebox",
                  "id": "PC_lAPOAGc3Zs4Ap8uBzgDYmu4"
                },
                {
                  "name": "7.14-candidate",
                  "id": "PC_lAPOAGc3Zs4Ap8uBzgDZjpM"
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockColumnQueryResponseForOrgProjectBug);
      const projectNumber = 17;
      const columnName = "Inbox";
      const column = await projectAssigner.findColumnIdForColumnName(mOctokit, projectScope, projectNumber, columnName, mockIssuesContext);
      expect(column).toBe('MDEzOlByb2plY3RDb2x1bW4xMjU1MTUwMg==')
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        {
          organization(login: "mocked_owner") {
              project(number: 17) {
                  columns(first: 50) {
                      nodes {
                          name,
                          id
                      }
                  }
              }
          }
        }`.replace(/\s+/g, ''));
    });
  });

  describe("findProjectCardId", () => {
    it("finds a project card for an issue", async () => {
      const mockIssuesQueryResponse = JSON.parse(`{
        "repository": {
          "issue": {
            "projectCards": {
              "edges": [
                {
                  "node": {
                    "project": {
                      "number": 17
                    },
                    "id": "mocked_issue_node_id"
                  }
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockIssuesQueryResponse);
      const projectNumber = 17;
      const cardId = await projectAssigner.findProjectCardId(mOctokit, projectNumber, mockIssuesContext);
      expect(cardId).toBe('mocked_issue_node_id')
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        {
          repository(owner: "mocked_owner", name: "repo1") {
              issue(number: 123) {
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
        }`.replace(/\s+/g, ''));
    });

    it("finds a project card for a pull request", async () => {
      const mockIssuesQueryResponse = JSON.parse(`{
        "repository": {
          "pullRequest": {
            "projectCards": {
              "edges": [
                {
                  "node": {
                    "project": {
                      "number": 17
                    },
                    "id": "mocked_issue_node_id"
                  }
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockIssuesQueryResponse);
      const projectNumber = 17;
      const cardId = await projectAssigner.findProjectCardId(mOctokit, projectNumber, mockPRsContext);
      expect(cardId).toBe('mocked_issue_node_id')
      expect(mOctokit.mock.calls.length).toBe(1);
      expect(mOctokit.mock.calls[0][0].replace(/\s+/g, '')).toBe(`
        {
          repository(owner: "mocked_owner", name: "repo1") {
              pullRequest(number: 543) {
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
        }`.replace(/\s+/g, ''));
    });

    it("fails to find a project card for an issue in a different project", async () => {
      const mockIssuesQueryResponse = JSON.parse(`{
        "repository": {
          "issue": {
            "projectCards": {
              "edges": [
                {
                  "node": {
                    "project": {
                      "number": 17
                    },
                    "id": "mocked_issue_node_id"
                  }
                }
              ]
            }
          }
        }
      }`);
      const mOctokit = jest.fn().mockResolvedValueOnce(mockIssuesQueryResponse);
      const projectNumber = 404;
      const cardId = await projectAssigner.findProjectCardId(mOctokit, projectNumber, mockIssuesContext);
      expect(cardId).toBe(null)
      expect(mOctokit.mock.calls.length).toBe(1);
    });
  });
});
