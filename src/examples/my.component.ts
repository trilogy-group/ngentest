import { Component, OnDestroy, OnInit } from '@angular/core';
import { finalize, map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs/Subject';

// Examples of models and dependecies
import { User } from 'example/models/user.model';
import { UserService } from 'example/services/user.service';

// An example of a token that can be injected
import { WINDOW_TOKEN } from 'example/tokens/window.token';

@Component({
  selector: 'ngui-inview',
  template: `
    <ng-container *ngIf="isInview" [ngTemplateOutlet]="template">
    </ng-container>
  `,
  styles: [':host {display: block;}']
})
export class MyComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject();

  public isLoading: boolean = true;
  public totalElements = 0;

  public users: User[];
  public currentQuery: string = '';
  public error: string;

  public constructor(
    private userService: UserService,
    @Inject(WINDOW_TOKEN) private window: Window,
  ) { }

  // using a dependency in ngOnInit (all tests needs to work with it).
  public ngOnInit(): void {
    const callGetUsers = () => {
      this.getUsers();
    };
    // just using the injected dependency
    this.window.setTimeout(callGetUsers, 1000);
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // A method that uses a dependency method and catch the observable error
  public getUsers(
    query: string = this.currentQuery,
  ): void {
    this.currentQuery = query;

    this.isLoading = true;
    this.userService.listUsers(query)
      .pipe(finalize(() => { this.isLoading = false; }))
      .subscribe(
        (users: User[]) => {
          this.totalElements = users.length;
          this.users = users;
        },
        error => {
          this.error = 'An error happened while retrieving users data.';
        }
      );
  }

  // A method that uses a local method (and this used method calls a dependency)
  public onRefresh(): void {
    this.getUsers();
  }
}
