import React from 'react';
import ReactDOM from 'react-dom';
import LoginBox from './LoginBox';

it('It should mount', () => {
  const div = document.createElement('div');
  ReactDOM.render(<LoginBox />, div);
  ReactDOM.unmountComponentAtNode(div);
});