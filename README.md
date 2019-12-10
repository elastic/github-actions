This repository contains various GitHub actions that the Elastic team has developed to help us automate some common processes.  Each action appears in it own folder.

To use these actions in your GitHub workfkflows, include them in the workflow configuration file step config.  For example:

	steps:
          - name: Assign to project
	    uses: elastic/github-actions/project-assigner@v1.0.0
	    id: project_assigner
	    with:
	      issue-mappings: '[{"label": "Test", "projectName": "test", "columnId": 1234},
	        {"label": "bug", "projectName": "test2", "columnId": 5678}]'
	      ghToken: ${{ secrets.GITHUB_TOKEN }}
