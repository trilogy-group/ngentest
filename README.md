# ngentest
Angular5+ Unit Test Generator For Components, Directive, Services and Pipes

## How It Works
1. Parse component/directive/service, then prepare the following data.
    - className
    - imports
    - input/output attributes and properties
    - dependencies that needs to be mocked
    - providers for TestBed
    - dependency methods that were called by the subject methods
    - properties and the default values (initialization)
    - errors that will be catch by the subject methods
2. Generate unit test from prepared data with .ejs template including tests to verify:
    - the initialization of the component
    - the usage of the dependencies and the correct calls to methods of these
    - the initialization of the subject class properties
    - the catching of errors that can be thrown by the dependencies methods

## Verifications that the generated tests DON'T do (yet):
- If some dependency is called passing the correct parameters.
- If some attribute of the component was directly affected and has the correct value after the execution.
- If the result of an async call is correctly stored in a component property.
- If the result of the called method was the expected value.
- If some dependency method was NOT called.
- If some attribute of the component did NOT has a wrong value.




## Install & Run
```
$ npm install ngentest -g # to run this command anywhere
$ ngentest my.component.ts # node_modules/.bin/gentest
$ ngentest my.directive.ts -s # write unit test to my.directive.spec.ts
$ ngentest my.pipe.ts > my.pipe.test.ts 
$ ngentest my.service.ts # prints the generated file into stdout
```

## Examples
### comopent unit test  generated
[my.component.ts](./src/examples/my.component.ts)
```
$ gentest my.component.ts > my.component.spec.ts
```
my.component.spec.ts
```
// tslint:disable
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs/observable/of';
import { _throw } from 'rxjs/observable/throw';
import { mock } from 'ts-mockito';

import {MyComponent} from './my.component';
import {UserService} from 'example/services/user.service';
import {WINDOW_TOKEN} from 'example/tokens/window.token';

// MOCKS FOR INJECTED DEPENDENCES
// The mocks of dependencies that can't be mocked with mockito is putted here. Please, change as needed.
const windowMock = {
  setTimeout: () => {},
};
// ------------------------------

describe('MyComponent', () => {
  let userService: UserService;
  let window: Window;
  let component: MyComponent;
  let fixture: ComponentFixture<typeof component>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [
        MyComponent
      ],
      providers: [
        { provide: UserService, useFactory: () => mock(UserService) },
        { provide: WINDOW_TOKEN, useValue: windowMock },
      ],
      schemas: [
        NO_ERRORS_SCHEMA,
      ],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    userService = TestBed.get(UserService);
    window = TestBed.get(WINDOW_TOKEN);
    fixture = TestBed.createComponent(MyComponent);
    component = fixture.componentInstance;
  });


  it("should be created", async(() => {
    expect(component).toBeTruthy();
  }));


  it("[isLoading] should be initialized with value true.", async(() => {
    expect(component.isLoading).toBe(true);
  }));
  it("[totalElements] should be initialized with value 0.", async(() => {
    expect(component.totalElements).toBe(0);
  }));
  it("[currentQuery] should be initialized with value ''.", async(() => {
    expect(component.currentQuery).toBe('');
  }));


  it('[ngOnInit] should runs without errors and uses its dependencies.', () => {
    let setTimeoutSpy = spyOn(window, 'setTimeout');
    let listUsersSpy = spyOn(userService, 'listUsers')
      // TODO: Change the return of listUsers method here if needed.
      .and.returnValue(of({}));
    component.ngOnInit();
    
    fixture.detectChanges();
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(listUsersSpy).toHaveBeenCalled();
    // TODO: Please put expectentions here, if needed.
  });

  it('[ngOnDestroy] should runs without errors and uses its dependencies.', () => {
    let setTimeoutSpy = spyOn(window, 'setTimeout');
    let listUsersSpy = spyOn(userService, 'listUsers')
      // TODO: Change the return of listUsers method here if needed.
      .and.returnValue(of({}));
    component.ngOnDestroy();
    
    fixture.detectChanges();
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(listUsersSpy).toHaveBeenCalled();
    // TODO: Please put expectentions here, if needed.
  });

  it('[getUsers] should runs without errors and uses its dependencies.', () => {
    let listUsersSpy = spyOn(userService, 'listUsers')
      // TODO: Change the return of listUsers method here if needed.
      .and.returnValue(of({}));
    let setTimeoutSpy = spyOn(window, 'setTimeout');

    // TODO: Change the parameters values here if needed.
    const query: string = '';
    component.getUsers(query);
    
    fixture.detectChanges();
    expect(listUsersSpy).toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalled();
    // TODO: Please put expectentions here, if needed.
  });

  it('[onRefresh] should runs without errors and uses its dependencies.', () => {
    let listUsersSpy = spyOn(userService, 'listUsers')
      // TODO: Change the return of listUsers method here if needed.
      .and.returnValue(of({}));
    let setTimeoutSpy = spyOn(window, 'setTimeout');
    component.onRefresh();
    
    fixture.detectChanges();
    expect(listUsersSpy).toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalled();
    // TODO: Please put expectentions here, if needed.
  });


  it('[getUsers] should set error message when userService.listUsers throws an error.', () => {
    spyOn(userService, 'listUsers').and.returnValue(_throw({}));
    
    const query: string = '';
    component.getUsers(query);

    expect(component.error).toBe('An error happened while retrieving users data.');
  });

});
```

### directive unit test  generated
[my.directive.ts](./src/examples/my.directive.ts)
```bash
$ gentest my.directive.ts > my.directrive.spec.ts
```
my.directive.spec.ts
```
// tslint:disable
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {MyDirective} from './src/examples/my.directive';
import {Directive, ElementRef, Renderer2, Inject, PLATFORM_ID} from '@angular/core';

class MockElementRef extends ElementRef {
  constructor() { super(undefined); }
  nativeElement = {}
}
(<any>window).IntersectionObserver = jest.fn();

@Component({
  template: `
    <div [options]="options" (nguiInview)="onNguiInview($event)" (nguiOutview)="onNguiOutview($event)"></div>
  `
})
class DirectiveTestComponent {
  options: any;

  onNguiInview(event): void { /* */ }
  onNguiOutview(event): void { /* */ }
}

describe('MyDirective', () => {
  let fixture: ComponentFixture<TestComponent>;
  let component: DirectiveTestComponent;
  let directiveEl;
  let directive;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [MyDirective, DirectiveTestComponent],
      providers: [
        {provide: ElementRef, useClass: MockElementRef},
        Renderer2,
        {provide: PLATFORM_ID,useValue: 'browser'},
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
    directiveEl = fixture.debugElement.query(By.directive(MyDirective));
    directive = directiveEl.injector.get(MyDirective);
  }));

  it("should run a directive", async(() => {
    expect(component).toBeTruthy();
    expect(directive).toBeTruthy();
  }));


  it('should run #ngOnInit()', async(() => {
    // ngOnInit();
  }));

  it('should run #ngOnDestroy()', async(() => {
    // ngOnDestroy();
  }));

  it('should run #handleIntersect()', async(() => {
    // handleIntersect(entries, observer);
  }));

});
```

### service unit test generated
[my.service.ts](./src/examples/my.service.ts)
```bash
$ gentest my.service.ts > my.service.spec.ts
```
my.directive.spec.ts
```
import {DynamicComponentService} from './src/examples/my.service';

describe('DynamicComponentService', () => {
  let service;


  const factoryResolver = {
    // mock properties here
  }

  beforeEach(() => {
    service = new DynamicComponentService(factoryResolver);
  });


  it('should run #createComponent()', async(() => {
    // const result = createComponent(component, into);
  }));

  it('should run #insertComponent()', async(() => {
    // const result = insertComponent(componentRef);
  }));

});
```

### pipe unit test generated
[my.pipe.ts](./src/examples/my.pipe.ts)
```bash
$ gentest my.pipe.ts > my.pipe.spec.ts
```
my.pipe.spec.ts
```
import {NguiHighlightPipe} from './src/examples/my.pipe';

describe('NguiHighlightPipe', () => {

  it('should run #transform', () => {
    // const pipe = new NguiHighlightPipe();
    // const result = pipe.transform(text, search);
    // expect(result).toBe('<<EXPECTED>>');
  });

});
```

