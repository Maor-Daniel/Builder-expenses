Error 1: 
i tryed deleting a project in the project tab and im getting this error in the consol: 
DELETE https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/projects/proj_1761600565924_maadfj0vk?cascade=true 500 (Internal Server Error)
apiCall @ (index):2447
deleteProjectAPI @ (index):2584
deleteProject @ (index):4906
onclick @ (index):1Understand this error
(index):2457 API call failed: Error: HTTP error! status: 500
    at apiCall ((index):2450:27)
    at async deleteProjectAPI ((index):2584:17)
    at async deleteProject ((index):4906:21)
apiCall @ (index):2457
await in apiCall
deleteProjectAPI @ (index):2584
deleteProject @ (index):4906
onclick @ (index):1Understand this error
(index):2586 Failed to delete project from API: Error: HTTP error! status: 500
    at apiCall ((index):2450:27)
    at async deleteProjectAPI ((index):2584:17)
    at async deleteProject ((index):4906:21)
deleteProjectAPI @ (index):2586
await in deleteProjectAPI
deleteProject @ (index):4906
onclick @ (index):1Understand this warning
(index):4920 Failed to delete project: Error: HTTP error! status: 500
    at apiCall ((index):2450:27)
    at async deleteProjectAPI ((index):2584:17)
    at async deleteProject ((index):4906:21)
deleteProject @ (index):4920
await in deleteProject
onclick @ (index):1Understand this error

Error 2:
I want to the contractor tab, tried to add a constractor and got this error:
(index):2447 
 POST https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/contractors 400 (Bad Request)

(index):2457 API call failed: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
apiCall	@	(index):2457
await in apiCall		
saveContractor	@	(index):2560
submitContractor	@	(index):3918
onsubmit	@	(index):2293
(index):2564 Failed to save contractor to API: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
saveContractor	@	(index):2564
await in saveContractor		
submitContractor	@	(index):3918
onsubmit	@	(index):2293
(index):3922 Failed to save contractor: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
submitContractor	@	(index):3922
await in submitContractor		
onsubmit	@	(index):2293

Error 3:
I was in the constractor tab and tried to delete a constactor and i got an error (its probebly linked to error 2):
(index):2447 
 POST https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/contractors 400 (Bad Request)

(index):2457 API call failed: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
apiCall	@	(index):2457
await in apiCall		
saveContractor	@	(index):2560
submitContractor	@	(index):3918
onsubmit	@	(index):2293
(index):2564 Failed to save contractor to API: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
saveContractor	@	(index):2564
await in saveContractor		
submitContractor	@	(index):3918
onsubmit	@	(index):2293
(index):3922 Failed to save contractor: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveContractor ((index):2560:17)
    at async submitContractor ((index):3918:17)
submitContractor	@	(index):3922
await in submitContractor		
onsubmit	@	(index):2293

Error 4: 
I was in the work tab, tried to add a work with the work forum and got this error:
OST https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/works 400 (Bad Request)
apiCall @ (index):2447
saveWork @ (index):4402
submitWork @ (index):4104
onsubmit @ (index):2333Understand this error
(index):2457 API call failed: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveWork ((index):4402:17)
    at async submitWork ((index):4104:17)
apiCall @ (index):2457
await in apiCall
saveWork @ (index):4402
submitWork @ (index):4104
onsubmit @ (index):2333Understand this error
(index):4407 Failed to save work to API: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveWork ((index):4402:17)
    at async submitWork ((index):4104:17)
saveWork @ (index):4407
await in saveWork
submitWork @ (index):4104
onsubmit @ (index):2333Understand this warning
(index):4125 Error saving work: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveWork ((index):4402:17)
    at async submitWork ((index):4104:17)

Error 5:
I tried to add a expence using the add expance and got this error: 
(index):2447 
 POST https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/expenses 400 (Bad Request)
apiCall	@	(index):2447
saveExpense	@	(index):2534
submitNewExpense	@	(index):3708
onsubmit	@	(index):2035

(index):2457 API call failed: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveExpense ((index):2534:17)
    at async submitNewExpense ((index):3708:17)
apiCall	@	(index):2457
await in apiCall		
saveExpense	@	(index):2534
submitNewExpense	@	(index):3708
onsubmit	@	(index):2035
(index):2538 Failed to save expense to API: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveExpense ((index):2534:17)
    at async submitNewExpense ((index):3708:17)
saveExpense	@	(index):2538
await in saveExpense		
submitNewExpense	@	(index):3708
onsubmit	@	(index):2035
(index):3710 Failed to save expense: Error: HTTP error! status: 400
    at apiCall ((index):2450:27)
    at async saveExpense ((index):2534:17)
    at async submitNewExpense ((index):3708:17)
submitNewExpense	@	(index):3710
await in submitNewExpense		
onsubmit	@	(index):2035
(index):2720 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'target')
    at switchTab ((index):2720:19)
    at (index):3720:17
switchTab	@	(index):2720
(anonymous)	@	(index):3720
setTimeout		
submitNewExpense	@	(index):3718
await in submitNewExpense		
onsubmit	@	(index):2035